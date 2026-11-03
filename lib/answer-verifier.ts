
import { openai } from "./openai";

export type ClaimVerdict =
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "CONTRADICTED"
  | "UNKNOWN";

export interface AnswerClaim {
  id: string;
  text: string;
  verdict: ClaimVerdict;
  evidenceIds: string[];
  reason: string;
}

export interface VerificationResult {
  question: string;
  answer: string;

  // 答案拆分后的独立结论
  claims: AnswerClaim[];

  // 整体验证结论
  verdict: "PASS" | "NEEDS_REVISION" | "REJECT";

  // 支持的结论比例
  supportRatio: number;

  // 未通过验证的结论
  issues: AnswerClaim[];

  reason: string;
}

export interface VerifierEvidence {
  id: string;
  content: string;
  source?: string;
}

export interface VerifyAnswerInput {
  question: string;
  answer: string;
  evidence: VerifierEvidence[];
}

export type ClaimJudge = (
  input: VerifyAnswerInput,
) => Promise<{
  claims: AnswerClaim[];
  reason: string;
}>;

// 将工具返回的数据统一转换成验证器可读的证据。
// 当前 Agent evidence 可能是数组、chunk 数组或 graph_search 返回对象。
export function normalizeEvidence(
  input: unknown[],
): VerifierEvidence[] {
  const result: VerifierEvidence[] = [];
  const visited = new WeakSet<object>();

  function visit(value: unknown): void {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value !== "object") return;

    if (visited.has(value)) return;
    visited.add(value);

    const record = value as Record<string, unknown>;

    // 普通 RAG chunk
    const content =
      typeof record.content === "string"
        ? record.content
        : typeof record.text === "string"
          ? record.text
          : undefined;

    if (content?.trim()) {
      result.push({
        id:
          typeof record.id === "string"
            ? record.id
            : `evidence-${result.length + 1}`,
        content: content.trim(),
        source:
          typeof record.source === "string"
            ? record.source
            : typeof record.title === "string"
              ? record.title
              : undefined,
      });
      return;
    }

    // Graph RAG 返回结构可能包含 chunks
    if (Array.isArray(record.chunks)) {
      visit(record.chunks);
    }

    // 兼容其他工具包装结构
    if (Array.isArray(record.evidence)) {
      visit(record.evidence);
    }

    if (Array.isArray(record.data)) {
      visit(record.data);
    }
  }

  input.forEach(visit);

  return result;
}

// 根据每条 claim 的验证结果计算整体结论。
export function evaluateVerification(
  input: VerifyAnswerInput,
  claims: AnswerClaim[],
  reason: string,
): VerificationResult {
  if (claims.length === 0) {
    return {
      question: input.question,
      answer: input.answer,
      claims: [],
      verdict: "REJECT",
      supportRatio: 0,
      issues: [],
      reason: "答案没有产生可验证的事实声明",
    };
  }

  const supportedCount = claims.filter(
    (claim) => claim.verdict === "SUPPORTED",
  ).length;

  const supportRatio =
    supportedCount / claims.length;

  const issues = claims.filter(
    (claim) => claim.verdict !== "SUPPORTED",
  );

  // 有明确矛盾，或者大量结论无法获得支持，拒绝直接输出。
  const hasContradiction = claims.some(
    (claim) => claim.verdict === "CONTRADICTED",
  );

  const hasUnknown = claims.some(
    (claim) => claim.verdict === "UNKNOWN",
  );

  const hasUnsupported = claims.some(
    (claim) => claim.verdict === "UNSUPPORTED",
  );

  let verdict: VerificationResult["verdict"];

  if (hasContradiction) {
    verdict = "REJECT";
  } else if (hasUnknown || hasUnsupported) {
    verdict = "NEEDS_REVISION";
  } else {
    verdict = "PASS";
  }

  return {
    question: input.question,
    answer: input.answer,
    claims,
    verdict,
    supportRatio,
    issues,
    reason,
  };
}

// 使用 LLM 识别答案中的 claim，并逐条对照证据。
export async function verifyAnswer(
  input: VerifyAnswerInput,
  judge: ClaimJudge = judgeClaimsWithLlm,
): Promise<VerificationResult> {
  if (!input.question.trim()) {
    throw new Error("EMPTY_QUESTION");
  }

  if (!input.answer.trim()) {
    throw new Error("EMPTY_ANSWER");
  }

  if (input.evidence.length === 0) {
    return evaluateVerification(
      input,
      [],
      "没有可用于验证答案的检索证据",
    );
  }

  const judged = await judge(input);

  return evaluateVerification(
    input,
    judged.claims,
    judged.reason,
  );
}

async function judgeClaimsWithLlm(
  input: VerifyAnswerInput,
): Promise<{
  claims: AnswerClaim[];
  reason: string;
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    temperature: 0,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
你是一个严格的 RAG 答案验证器。

你的任务：
1. 将答案拆分成独立、可验证的事实声明。
2. 逐条检查事实声明是否得到提供的证据支持。
3. 每条声明只能使用以下 verdict：
   - SUPPORTED：证据明确支持
   - UNSUPPORTED：证据没有提供足够支持
   - CONTRADICTED：证据明确与声明矛盾
   - UNKNOWN：证据无法判断
4. evidenceIds 只能引用实际提供的证据 ID。
5. 不得使用外部知识替代证据。
6. 不得因为声明听起来合理就判断为 SUPPORTED。
7. 不要将一个复杂句子中的多个独立事实合并成一个 claim。
8. 对于无法验证的结论，必须明确指出原因。

返回 JSON：
{
  "claims": [
    {
      "id": "claim-1",
      "text": "事实声明",
      "verdict": "SUPPORTED",
      "evidenceIds": ["evidence-1"],
      "reason": "判断原因"
    }
  ],
  "reason": "整体验证说明"
}
        `,
      },
      {
        role: "user",
        content: JSON.stringify({
          question: input.question,
          answer: input.answer,
          evidence: input.evidence,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message.content;

  if (!content) {
    throw new Error("EMPTY_VERIFICATION_RESPONSE");
  }

  const parsed = JSON.parse(content) as {
    claims?: AnswerClaim[];
    reason?: string;
  };

  if (!Array.isArray(parsed.claims)) {
    throw new Error("INVALID_VERIFICATION_RESULT");
  }

  const validVerdicts = new Set<ClaimVerdict>([
    "SUPPORTED",
    "UNSUPPORTED",
    "CONTRADICTED",
    "UNKNOWN",
  ]);

  const evidenceIds = new Set(
    input.evidence.map((item) => item.id),
  );

  const claims = parsed.claims.map((claim, index) => {
    if (
      !validVerdicts.has(claim.verdict) ||
      typeof claim.text !== "string" ||
      !Array.isArray(claim.evidenceIds)
    ) {
      throw new Error("INVALID_CLAIM_RESULT");
    }

    const validEvidenceIds = claim.evidenceIds.filter(
      (id) =>
        typeof id === "string" &&
        evidenceIds.has(id),
    );

    return {
      id: `claim-${index + 1}`,
      text: claim.text,
      verdict: claim.verdict,
      evidenceIds: validEvidenceIds,
      reason:
        typeof claim.reason === "string"
          ? claim.reason
          : "",
    };
  });

  return {
    claims,
    reason: parsed.reason ?? "验证完成",
  };
}

import { openai } from "../lib/openai";
import { withTimeout } from "../lib/timeout";

export interface CorrectnessJudgeResult {
  score: number;
  reason: string;
}

export interface RelevanceJudgeResult {
  score: number;
  reason: string;
}

export interface FaithfulnessClaim {
    claim: string;
    verdict: "SUPPORTED" | "NOT_SUPPORTED";
    reason: string;
  }
  
export interface FaithfulnessJudgeResult {
    score: number;
    supportedClaims: number;
    totalClaims: number;
    claims: FaithfulnessClaim[];
  }


  export type CitationSupportVerdict =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "NO_CITATION"
  | "INVALID_SOURCE";

export interface CitationSupportClaim {
  claim: string;
  citationSourceIds: number[];
  verdict: CitationSupportVerdict;
  reason: string;
}

export interface CitationSupportJudgeResult {
  supportedClaims: number;
  citedClaims: number;
  totalClaims: number;
  unsupportedClaims: number;
  uncitedClaims: number;
  invalidSourceClaims: number;
  citationSupportRate: number | null;
  citationCoverage: number | null;
  claims: CitationSupportClaim[];
}

export async function judgeAnswerCorrectness(
  question: string,
  referenceAnswer: string,
  generatedAnswer: string
): Promise<CorrectnessJudgeResult> {
  const prompt = `
你是一个 RAG Evaluation Judge。

请判断 Generated Answer 是否正确回答了 Question，
并与 Reference Answer 保持语义一致。

你需要重点判断：

1. Generated Answer 是否回答了问题。
2. Generated Answer 的核心事实是否正确。
3. 是否遗漏了 Reference Answer 中的重要信息。
4. 是否加入了与 Reference Answer 冲突的错误信息。
5. 不要求 Generated Answer 与 Reference Answer 逐字一致。
6. 如果表达方式不同，但语义正确，应认为正确。

评分标准：

5 = 完全正确，核心信息完整，没有明显错误。
4 = 基本正确，只有轻微遗漏或不重要的问题。
3 = 部分正确，但遗漏了重要信息。
2 = 包含一些正确内容，但存在明显错误或重要遗漏。
1 = 基本错误，没有正确回答问题。
0 = 完全没有回答问题，或者答案与问题明显无关。

Question:

${question}

Reference Answer:

${referenceAnswer}

Generated Answer:

${generatedAnswer}

请严格返回 JSON：

{
  "score": 0,
  "reason": "简要说明评分理由"
}

其中 score 必须是 0 到 5 之间的整数。
`;

  const response =
    await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "你是一个严格的 RAG Evaluation Judge。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
      }),
      30000
    );

  const content =
    response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);

    const score = Number(parsed.score);

    if (
      !Number.isInteger(score) ||
      score < 0 ||
      score > 5
    ) {
      throw new Error(
        `Invalid correctness score: ${parsed.score}`
      );
    }

    return {
      score,
      reason: String(parsed.reason ?? ""),
    };
  } catch (error) {
    throw new Error(
      `Failed to parse correctness judge response: ${content}`,
      { cause: error }
    );
  }
}

export async function judgeAnswerRelevance(
  question: string,
  generatedAnswer: string
): Promise<RelevanceJudgeResult> {
  const prompt = `
你是一个 RAG Evaluation Judge。

请判断 Generated Answer 与 Question 的相关性。

重点判断：

1. Generated Answer 是否直接回答了 Question。
2. 是否围绕 Question 的核心意图展开。
3. 是否包含明显跑题的信息。
4. 是否存在大量与问题无关的额外内容。
5. 如果答案简洁但完整回答了问题，应认为相关。
6. 不要因为答案没有覆盖 Reference Answer 的所有细节而降低相关性。
7. 不评价答案事实是否正确，只评价答案是否与问题相关。
8. 如果知识库中没有相关信息，而 Generated Answer明确说明当前知识库没有找到相关信息，则认为该答案与 Question 相关。

评分标准：

5 = 完全相关，直接回答问题，没有明显无关内容，对于知识库无法回答的问题:明确、合理地拒答属于高相关性答案。
4 = 基本相关，主要回答了问题，只有少量不必要内容。
3 = 部分相关，回答了问题的一部分，但存在一定跑题或遗漏。
2 = 相关性较低，只涉及问题的一小部分，或者包含较多无关内容。
1 = 基本不相关，只与问题有很弱的联系。
0 = 完全没有回答问题，与 Question 明显无关。

Question:

${question}

Generated Answer:

${generatedAnswer}

请严格返回 JSON：

{
  "score": 0,
  "reason": "简要说明评分理由"
}

其中 score 必须是 0 到 5 之间的整数。
`;

  const response =
    await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "你是一个严格的 RAG Evaluation Judge。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
      }),
      30000
    );

  const content =
    response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);

    const score = Number(parsed.score);

    if (
      !Number.isInteger(score) ||
      score < 0 ||
      score > 5
    ) {
      throw new Error(
        `Invalid relevance score: ${parsed.score}`
      );
    }

    return {
      score,
      reason: String(parsed.reason ?? ""),
    };
  } catch (error) {
    throw new Error(
      `Failed to parse relevance judge response: ${content}`,
      { cause: error }
    );
  }
}

export async function judgeAnswerFaithfulness(
  context: string,
  generatedAnswer: string
): Promise<FaithfulnessJudgeResult> {
  const prompt = `
  你是一个严格、稳定的 RAG Faithfulness Evaluation Judge。

  你的任务是评估 Generated Answer 中的事实性陈述是否得到
  Retrieved Context 的支持。

  Faithfulness 只衡量答案是否忠实于 Retrieved Context。
  不要使用外部知识，也不要使用 Reference Answer。
  不要因为答案与问题相关，就认为其事实陈述得到了支持。

  ## 一、Claim 提取规则

  1. 只提取可以独立判断真假的事实性技术陈述。
  2. 一个 Claim 应表达一个完整、可验证的技术含义。
  3. 如果一个句子包含多个彼此独立的事实，可以拆分。
  4. 不要把同一个事实换一种说法后重复计入。
  5. 不要将一个事实拆成过多细碎的 Claim。
  6. 纯粹的代码示例、标题、过渡语和没有独立事实含义的表达，
    不应单独计为 Claim。
  7. 如果答案是合理的知识库信息不足声明，且没有提出其他事实，
    返回空 claims 数组。

  ## 二、证据判断规则

  对每个 Claim，必须结合其完整语义进行判断，而不是只匹配关键词。

  SUPPORTED：
  - Context 明确陈述了该事实；或
  - Context 以清晰、直接的方式支持该事实的语义概括；
  - 对因果关系、条件和适用范围的概括，也必须有相应依据。

  NOT_SUPPORTED：
  - Context 没有提供足够证据支持该事实；
  - Claim 增加了 Context 未说明的条件、因果关系、适用范围或结论；
  - Context 只讨论相关概念，却没有支持 Claim 所表达的具体结论；
  - Claim 的部分关键内容不受支持，且无法拆分为独立的事实陈述。

  注意：
  - 不要求 Claim 与 Context 逐字一致。
  - 合理的语义改写应视为支持。
  - 不能仅因为某个术语或主题出现在 Context 中，就判为 SUPPORTED。
  - 不要因为 Claim 与问题相关，或者它在一般技术知识上可能正确，
    就判为 SUPPORTED。
  - 不要因为答案遗漏了其他信息，就否定其中已经得到支持的 Claim。
  - 不要使用 Reference Answer 或预期答案来判断 Faithfulness。

  ## 三、适用场景与结论必须分别核验

  如果 Claim 声称某个工具适用于某个特定场景，
  Context 必须支持这一适用关系，而不只是提到该工具。

  例如：
  Context 介绍了 React.memo、useMemo 和 useCallback 的性能优化用途，
  并不自动意味着这些工具能够替代 useRef，
  用于保存一个变化时不应触发重新渲染的值。

  判断时应核验 Claim 自身表达的完整含义，
  但不要把“是否直接回答 Question”作为 Faithfulness 的评分标准。
  答案是否解决问题，由 Correctness 评估。

  ## 四、判定理由

  每条 Claim 都必须包含简洁、具体的 reason：

  - SUPPORTED：说明 Context 中支持该陈述的具体内容。
  - NOT_SUPPORTED：说明缺少什么证据，或者 Claim 的哪个关键部分
    超出了 Context 的支持范围。

  不要仅写“Context 支持该陈述”或“Context 没有提到”。

  ## Retrieved Context

  ${context}

  ## Generated Answer

  ${generatedAnswer}

  请严格返回 JSON，不要返回 Markdown，不要使用代码块：

  {
    "claims": [
      {
        "claim": "一个独立、可验证的事实陈述",
        "verdict": "SUPPORTED",
        "reason": "说明 Context 中的具体支持依据"
      }
    ]
  }

  要求：
  - claims 必须是数组。
  - verdict 只能是 SUPPORTED 或 NOT_SUPPORTED。
  - 每个 Claim 必须具有非空的 claim 和 reason 字符串。
  - 如果没有事实性 Claim，返回 {"claims": []}。
  `;

  const response = await withTimeout(
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "你是一个严格的 RAG Faithfulness Evaluation Judge。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
    }),
    30000
  );

  const content =
    response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed.claims)) {
      throw new Error("Invalid faithfulness claims");
    }

    const claims: FaithfulnessClaim[] =
      parsed.claims.map((item: unknown) => {
        if (
          typeof item !== "object" ||
          item === null
        ) {
          throw new Error("Invalid faithfulness claim");
        }

        const claim = item as {
          claim?: unknown;
          verdict?: unknown;
          reason?: unknown;
        };

        if (
          typeof claim.claim !== "string" ||
          claim.claim.trim().length === 0 ||
          (claim.verdict !== "SUPPORTED" &&
            claim.verdict !== "NOT_SUPPORTED") ||
          typeof claim.reason !== "string" ||
          claim.reason.trim().length === 0
        ) {
          throw new Error(
            "Invalid faithfulness claim structure"
          );
        }
        
        return {
          claim: claim.claim.trim(),
          verdict: claim.verdict,
          reason: typeof claim.reason === "string" ? claim.reason.trim():"",
        };

      });

    const supportedClaims = claims.filter(
      (claim) => claim.verdict === "SUPPORTED"
    ).length;

    const totalClaims = claims.length;

    const score =
      totalClaims === 0
        ? 1
        : supportedClaims / totalClaims;

    return {
      score,
      supportedClaims,
      totalClaims,
      claims,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse faithfulness judge response: ${content}`,
      { cause: error }
    );
  }
}



export async function judgeAnswerCitationSupport(
  context: string,
  generatedAnswer: string
): Promise<CitationSupportJudgeResult> {
  const prompt = `
你是一个严格的 RAG Citation Support Evaluation Judge。

你的任务是判断 Generated Answer 中的事实性陈述，
是否得到该陈述明确引用的 Source 的支持。

注意：你评估的是“引用来源是否支持对应陈述”，
不是整个答案是否正确，也不是答案是否得到任意上下文的支持。

## 一、事实陈述提取规则

1. 将答案拆分为独立、可验证的事实性陈述。
2. 如果一个句子包含多个独立事实，应拆分为多个 Claim。
3. 不要重复计算相同事实。
4. 不将标题、过渡语、纯粹的建议性表达或无事实内容的拒答声明
   作为事实性 Claim。
5. 如果答案包含多个事实性陈述，即使它们位于同一句话中，
   也应分别评估引用是否足以支持每个陈述。

## 二、引用归属规则

1. 只将答案中实际出现的 [Source N] 视为引用。
2. 优先将句子末尾或紧邻陈述的引用归属于该陈述。
3. 如果一个句子包含多个事实，并且只在句末有引用，
   不要自动认为该引用能够支持其中的所有事实。
   应逐条核验。
4. 不要自行补充答案中不存在的引用。
5. 如果某个事实性 Claim 没有引用，返回 NO_CITATION。
6. 如果引用的 Source ID 不存在于 Retrieved Context，
   返回 INVALID_SOURCE。
7. 如果同时存在有效和无效引用，只使用 Retrieved Context 中
   实际存在的来源判断支持度；不要把无效来源当作证据。

## 三、支持度判断规则

SUPPORTED：
被该 Claim 实际引用的来源，明确支持该陈述的核心事实及其适用范围。

NOT_SUPPORTED：
引用的来源没有提供足够证据支持该陈述，或者只涉及相关主题，
却没有支持该陈述的具体结论、条件、因果关系或适用场景。

NO_CITATION：
该事实性 Claim 没有对应的 Source 引用。

INVALID_SOURCE：
该 Claim 引用的所有 Source ID 均不存在于 Retrieved Context。

特别注意：

- 不要因为某个来源提到了相同的技术术语，就判定引用有效。
- 不要使用外部知识或 Reference Answer。
- 不要因为其他未被引用的上下文支持该 Claim，
  就判定当前引用支持该 Claim。
- 如果来源只支持 Claim 的一部分关键内容，
  不应直接判定为完全支持。
- 不要把引用格式有效等同于引用内容受到支持。
- 不要因为 Claim 本身可能正确，就判定引用支持它。

## Retrieved Context

${context}

## Generated Answer

${generatedAnswer}

请严格返回 JSON，不要返回 Markdown 或代码块：

{
  "claims": [
    {
      "claim": "一个独立、可验证的事实陈述",
      "citationSourceIds": [1],
      "verdict": "SUPPORTED",
      "reason": "说明引用来源具体支持了什么，或缺少什么证据"
    }
  ]
}

要求：
- claims 必须是数组。
- citationSourceIds 必须是数组，元素为正整数。
- verdict 只能是 SUPPORTED、NOT_SUPPORTED、NO_CITATION、
  INVALID_SOURCE 之一。
- claim 和 reason 必须是非空字符串。
- 没有事实性 Claim 时返回 {"claims": []}。
`;

  const response = await withTimeout(
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "你是一个严格的 RAG Citation Support Evaluation Judge。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
    }),
    30000
  );

  const content =
    response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed.claims)) {
      throw new Error("Invalid citation support claims");
    }

    const allowedVerdicts: CitationSupportVerdict[] = [
      "SUPPORTED",
      "NOT_SUPPORTED",
      "NO_CITATION",
      "INVALID_SOURCE",
    ];

    const contextSourceIds = new Set<number>();
    const contextSourceRegex = /^[ \t]*\[Source[ \t]+(\d+)\][ \t]*$/gm;

    for (const match of context.matchAll(contextSourceRegex)) {
      const sourceId = Number(match[1]);

      if (Number.isSafeInteger(sourceId) && sourceId > 0) {
        contextSourceIds.add(sourceId);
      }
    }

    const claims: CitationSupportClaim[] = parsed.claims.map(
      (item: unknown) => {
        if (typeof item !== "object" || item === null) {
          throw new Error("Invalid citation support claim");
        }

        const claim = item as {
          claim?: unknown;
          citationSourceIds?: unknown;
          verdict?: unknown;
          reason?: unknown;
        };

        if (
          typeof claim.claim !== "string" ||
          claim.claim.trim().length === 0 ||
          !Array.isArray(claim.citationSourceIds) ||
          !claim.citationSourceIds.every(
            (id: unknown) =>
              Number.isSafeInteger(id) &&
              typeof id === "number" &&
              id > 0
          ) ||
          typeof claim.verdict !== "string" ||
          !allowedVerdicts.includes(
            claim.verdict as CitationSupportVerdict
          ) ||
          typeof claim.reason !== "string" ||
          claim.reason.trim().length === 0
        ) {
          throw new Error("Invalid citation support claim structure");
        }

        const citationSourceIds = [
          ...new Set(claim.citationSourceIds as number[]),
        ];

        // Derive citation absence/invalidity from actual context IDs,
        // rather than trusting the Judge's verdict for these cases.
        let verdict = claim.verdict as CitationSupportVerdict;

        if (citationSourceIds.length === 0) {
          verdict = "NO_CITATION";
        } else if (
          !citationSourceIds.some((id) => contextSourceIds.has(id))
        ) {
          verdict = "INVALID_SOURCE";
        } else if (
          verdict === "NO_CITATION" ||
          verdict === "INVALID_SOURCE"
        ) {
          // At least one cited source exists. Require a substantive
          // support verdict for claims that have usable evidence.
          throw new Error(
            "Inconsistent verdict for a claim with a valid source"
          );
        }

        return {
          claim: claim.claim.trim(),
          citationSourceIds,
          verdict,
          reason: claim.reason.trim(),
        };
      }
    );

    const supportedClaims = claims.filter(
      (claim) => claim.verdict === "SUPPORTED"
    ).length;

    const citedClaims = claims.filter(
      (claim) =>
        claim.verdict === "SUPPORTED" ||
        claim.verdict === "NOT_SUPPORTED"
    ).length;

    const unsupportedClaims = claims.filter(
      (claim) => claim.verdict === "NOT_SUPPORTED"
    ).length;

    const uncitedClaims = claims.filter(
      (claim) => claim.verdict === "NO_CITATION"
    ).length;

    const invalidSourceClaims = claims.filter(
      (claim) => claim.verdict === "INVALID_SOURCE"
    ).length;

    const totalClaims = claims.length;

    return {
      supportedClaims,
      citedClaims,
      totalClaims,
      unsupportedClaims,
      uncitedClaims,
      invalidSourceClaims,
      citationSupportRate:
        citedClaims === 0 ? null : supportedClaims / citedClaims,
      citationCoverage:
        totalClaims === 0 ? null : citedClaims / totalClaims,
      claims,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse citation support judge response: ${content}`,
      { cause: error }
    );
  }
}

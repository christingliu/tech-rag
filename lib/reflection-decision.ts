
import type {
    AnswerClaim,
    VerificationResult,
  } from "./answer-verifier";
  
  export type ReflectionAction =
    | "ACCEPT"
    | "SUPPLEMENT_RETRIEVAL"
    | "REVISE_ANSWER"
    | "REFUSE";
  
  export interface ReflectionDecision {
    action: ReflectionAction;
  
    // 为什么作出这个决策
    reason: string;
  
    // 需要重点处理的 claim
    targetClaims: string[];
  
    // 建议补充检索的内容
    retrievalQueries: string[];
  
    // 修正答案时允许保留的结论
    retainedClaims: AnswerClaim[];
  
    // 当前已经执行的补充检索次数
    retrievalAttempts: number;
  
    // 最大允许补充检索次数
    maxRetrievalAttempts: number;
  }
  
  export interface ReflectionDecisionOptions {
    retrievalAttempts?: number;
    maxRetrievalAttempts?: number;
  }
  
  function getProblemClaims(
    verification: VerificationResult,
  ): AnswerClaim[] {
    return verification.claims.filter(
      (claim) => claim.verdict !== "SUPPORTED",
    );
  }
  
  // 从未得到支持的结论中提取补充检索问题。
  // 这里只生成检索意图，真正执行检索放到 V9.7.3。
  function buildRetrievalQueries(
    claims: AnswerClaim[],
  ): string[] {
    return [
      ...new Set(
        claims.map((claim) => claim.text.trim()).filter(Boolean),
      ),
    ];
  }
  
  export function decideReflection(
    verification: VerificationResult,
    options: ReflectionDecisionOptions = {},
  ): ReflectionDecision {
    const retrievalAttempts = Math.max(
      0,
      options.retrievalAttempts ?? 0,
    );
  
    const maxRetrievalAttempts = Math.max(
      0,
      options.maxRetrievalAttempts ?? 2,
    );
  
    const canRetrieve =
      retrievalAttempts < maxRetrievalAttempts;
  
    const problemClaims = getProblemClaims(verification);
  
    const supportedClaims = verification.claims.filter(
      (claim) => claim.verdict === "SUPPORTED",
    );
  
    const hasContradiction = verification.claims.some(
      (claim) => claim.verdict === "CONTRADICTED",
    );
  
    const needsMoreEvidence =
      verification.claims.some(
        (claim) =>
          claim.verdict === "UNSUPPORTED" ||
          claim.verdict === "UNKNOWN",
      );
  
    const base = {
      targetClaims: problemClaims.map((claim) => claim.id),
      retrievalQueries: buildRetrievalQueries(problemClaims),
      retainedClaims: supportedClaims,
      retrievalAttempts,
      maxRetrievalAttempts,
    };
  
    // 1. 所有结论都有证据支持
    if (verification.verdict === "PASS") {
      return {
        ...base,
        action: "ACCEPT",
        reason: "所有答案结论均通过证据验证",
        targetClaims: [],
        retrievalQueries: [],
      };
    }


  // 没有任何可验证的 claim，通常意味着没有检索证据。
  // 在还有检索预算时，应该先尝试补充检索。
  if (
    verification.claims.length === 0 &&
    canRetrieve
  ) {
    return {
      ...base,
      action: "SUPPLEMENT_RETRIEVAL",
      reason: "当前没有可验证的证据，先补充检索",
      targetClaims: [],
      retrievalQueries: [verification.question],
    };
  }
  
    // 2. 证据矛盾：优先补充检索核实
    if (hasContradiction) {
      if (canRetrieve) {
        return {
          ...base,
          action: "SUPPLEMENT_RETRIEVAL",
          reason: "发现答案与证据存在矛盾，需要补充检索核实",
        };
      }
  
      return {
        ...base,
        action: "REFUSE",
        reason: "达到最大补充检索次数，证据矛盾仍未解决",
      };
    }
  
    // 3. 证据不足：优先补充检索
    if (needsMoreEvidence && canRetrieve) {
      return {
        ...base,
        action: "SUPPLEMENT_RETRIEVAL",
        reason: "部分答案结论缺乏证据支持，需要补充检索",
      };
    }
  
    // 4. 检索次数用完后，尝试保留有证据支持的结论
    if (needsMoreEvidence && supportedClaims.length > 0) {
      return {
        ...base,
        action: "REVISE_ANSWER",
        reason: "补充检索次数已用完，删除缺乏证据支持的结论",
      };
    }
  
    // 5. 没有任何可保留的可靠结论
    return {
      ...base,
      action: "REFUSE",
      reason: "没有足够可靠的证据支持答案",
    };
  }
  
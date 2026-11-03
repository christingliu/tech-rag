
import {
    runAgent,
    type AgentControllerOptions,
    type AgentRunResult,
  } from "./agent-controller";
  
  import {
    normalizeEvidence,
    verifyAnswer,
    type VerificationResult,
    type VerifyAnswerInput,
  } from "./answer-verifier";
  
  import {
    decideReflection,
    type ReflectionAction,
    type ReflectionDecision,
  } from "./reflection-decision";
  
  export interface AnswerGenerationInput {
    question: string;
    evidence: unknown[];
  
    // 修正答案时，只允许保留这些已验证结论
    retainedClaims?: string[];
  
    // 告诉生成模型需要修正的内容
    correctionInstructions?: string[];
  }
  
  export interface SelfCorrectionOptions {
    // 重新生成答案
    generateAnswer: (
      input: AnswerGenerationInput,
    ) => Promise<string>;
  
    // 补充检索
    retrieve: (
      query: string,
    ) => Promise<unknown[]>;
  
    // 验证器，默认使用 V9.7.1 的 verifyAnswer
    verify?: (
      input: VerifyAnswerInput,
    ) => Promise<VerificationResult>;
  
    maxRetrievalAttempts?: number;
    maxCorrectionAttempts?: number;
  }
  
  export interface ReflectionTrace {
    round: number;
    answer: string;
    verdict: VerificationResult["verdict"];
    action: ReflectionAction;
    reason: string;
    retrievalQueries: string[];
    evidenceCount: number;
  }
  
  export interface SelfCorrectionResult extends AgentRunResult {
    answer?: string;
  
    verification?: VerificationResult;
  
    reflectionDecision?: ReflectionDecision;
  
    reflectionTrace: ReflectionTrace[];
  
    retrievalAttempts: number;
    correctionAttempts: number;
  }
  
  export async function runSelfCorrectingAgent(
    question: string,
    agentOptions: AgentControllerOptions,
    options: SelfCorrectionOptions,
  ): Promise<SelfCorrectionResult> {
    //最大检索数量
    const maxRetrievalAttempts =
      options.maxRetrievalAttempts ?? 2;
    //最大修改数量
    const maxCorrectionAttempts =
      options.maxCorrectionAttempts ?? 2;
  
    if (
      !Number.isInteger(maxRetrievalAttempts) ||
      maxRetrievalAttempts < 0
    ) {
      throw new Error("INVALID_MAX_RETRIEVAL_ATTEMPTS");
    }
  
    if (
      !Number.isInteger(maxCorrectionAttempts) ||
      maxCorrectionAttempts < 0
    ) {
      throw new Error("INVALID_MAX_CORRECTION_ATTEMPTS");
    }
  
    const trace: ReflectionTrace[] = [];
  
    let retrievalAttempts = 0;
    let correctionAttempts = 0;
  
    // 第一阶段：运行现有 Agent，生成初始答案。
    const initialResult = await runAgent(
      question,
      agentOptions,
    );
    console.log(initialResult,'initialResult');
    const baseResult = (
      extra: Partial<SelfCorrectionResult>,
    ): SelfCorrectionResult => ({
      ...initialResult,
      ...extra,
      reflectionTrace: trace,
      retrievalAttempts,
      correctionAttempts,
    });
  
    if (
      initialResult.status !== "completed" ||
      !initialResult.answer
    ) {
      return baseResult({
        status: initialResult.status,
        stopReason: initialResult.stopReason,
      });
    }
  
    let evidence = [...initialResult.evidence];
    let answer = initialResult.answer;
  
    const verify = options.verify ?? verifyAnswer;
  
    // 每轮都必须重新验证。
    // 上限 = 补充检索次数 + 修正次数 + 初始验证。
    const maxRounds =
      maxRetrievalAttempts + maxCorrectionAttempts + 1;
  
    let latestVerification: VerificationResult | undefined;
    let latestDecision: ReflectionDecision | undefined;
  
    for (let round = 1; round <= maxRounds; round++) {
      // 第二阶段：验证答案。
      const normalizedEvidence = normalizeEvidence(evidence);
  
      latestVerification = await verify({
        question,
        answer,
        evidence: normalizedEvidence,
      });
  
      // 第三阶段：根据验证结果决定下一步。
      latestDecision = decideReflection(
        latestVerification,
        {
          retrievalAttempts,
          maxRetrievalAttempts,
        },
      );
  
      trace.push({
        round,
        answer,
        verdict: latestVerification.verdict,
        action: latestDecision.action,
        reason: latestDecision.reason,
        retrievalQueries: [
          ...latestDecision.retrievalQueries,
        ],
        evidenceCount: normalizedEvidence.length,
      });
  
      // 通过验证，才允许返回答案。
      if (latestDecision.action === "ACCEPT") {
        return baseResult({
          status: "completed",
          answer,
          evidence,
          verification: latestVerification,
          reflectionDecision: latestDecision,
          stopReason: "ANSWER_VERIFIED",
        });
      }
  
      // 无法可靠回答。
      if (latestDecision.action === "REFUSE") {
        return baseResult({
          status: "failed",
          answer: undefined,
          evidence,
          verification: latestVerification,
          reflectionDecision: latestDecision,
          stopReason: "ANSWER_VERIFICATION_REJECTED",
        });
      }
  
      // 第四阶段 A：补充检索。
      if (
        latestDecision.action === "SUPPLEMENT_RETRIEVAL"
      ) {
        if (retrievalAttempts >= maxRetrievalAttempts) {
          return baseResult({
            status: "failed",
            answer: undefined,
            evidence,
            verification: latestVerification,
            reflectionDecision: latestDecision,
            stopReason: "MAX_RETRIEVAL_ATTEMPTS_REACHED",
          });
        }
  
        retrievalAttempts++;
  
        const queries =
          latestDecision.retrievalQueries.length > 0
            ? latestDecision.retrievalQueries
            : [question];
  
        let newEvidence: unknown[] = [];
  
        for (const query of queries) {
          const results = await options.retrieve(query);
          newEvidence = [...newEvidence, ...results];
        }
  
        // 补充检索后没有新增证据，也允许再次验证，
        // 但不会无限重复，因为 retrievalAttempts 有上限。
        evidence = [...evidence, ...newEvidence];
  
        // 使用更新后的证据重新生成答案。
        answer = await options.generateAnswer({
          question,
          evidence,
          correctionInstructions: [
            "请根据新增证据重新检查原答案。",
            "不要保留缺乏证据支持的结论。",
            "如果证据存在矛盾，请明确说明。",
          ],
        });
  
        if (!answer.trim()) {
          return baseResult({
            status: "failed",
            answer: undefined,
            evidence,
            verification: latestVerification,
            reflectionDecision: latestDecision,
            stopReason: "EMPTY_REVISED_ANSWER",
          });
        }
  
        continue;
      }
  
      // 第四阶段 B：删除不可靠结论，重新生成答案。
      if (latestDecision.action === "REVISE_ANSWER") {
        if (correctionAttempts >= maxCorrectionAttempts) {
          return baseResult({
            status: "failed",
            answer: undefined,
            evidence,
            verification: latestVerification,
            reflectionDecision: latestDecision,
            stopReason: "MAX_CORRECTION_ATTEMPTS_REACHED",
          });
        }
  
        correctionAttempts++;
  
        answer = await options.generateAnswer({
          question,
          evidence,
          retainedClaims:
            latestDecision.retainedClaims.map(
              (claim) => claim.text,
            ),
          correctionInstructions:
            latestVerification.issues.map(
              (claim) =>
                `删除或修正以下未通过验证的结论：${claim.text}。原因：${claim.reason}`,
            ),
        });
  
        if (!answer.trim()) {
          return baseResult({
            status: "failed",
            answer: undefined,
            evidence,
            verification: latestVerification,
            reflectionDecision: latestDecision,
            stopReason: "EMPTY_REVISED_ANSWER",
          });
        }
  
        continue;
      }
    }
  
    // 不能因为循环结束就默认答案通过。
    return baseResult({
      status: "failed",
      answer: undefined,
      evidence,
      verification: latestVerification,
      reflectionDecision: latestDecision,
      stopReason: "SELF_CORRECTION_MAX_ROUNDS_REACHED",
    });
  }
  
import './env';
import assert from "node:assert/strict";

import { runSelfCorrectingAgent } from "../lib/self-correction";
import type { AgentControllerOptions } from "../lib/agent-controller";

// 使用固定证据，避免测试依赖 Qdrant 和真实 LLM。
const initialEvidence = {
  id: "evidence-1",
  content: "useState 用于在函数组件中管理状态。",
};

const additionalEvidence = {
  id: "evidence-2",
  content: "useEffect 用于处理副作用。",
};

function createVerification(
  verdict: "PASS" | "NEEDS_REVISION" | "REJECT",
  claims: Array<{
    id: string;
    text: string;
    verdict: "SUPPORTED" | "UNSUPPORTED" | "CONTRADICTED" | "UNKNOWN";
    evidenceIds: string[];
    reason: string;
  }>,
) {
  return {
    question: "React Hooks 分别解决什么问题？",
    answer: "useState 管理状态，useEffect 处理副作用。",
    claims,
    verdict,
    supportRatio:
      claims.length === 0
        ? 0
        : claims.filter((item) => item.verdict === "SUPPORTED").length /
          claims.length,
    issues: [],
    reason: `mock verification: ${verdict}`,
  };
}

const supportedVerification = createVerification("PASS", [
  {
    id: "claim-1",
    text: "useState 用于管理状态",
    verdict: "SUPPORTED",
    evidenceIds: ["evidence-1"],
    reason: "有证据支持",
  },
  {
    id: "claim-2",
    text: "useEffect 用于处理副作用",
    verdict: "SUPPORTED",
    evidenceIds: ["evidence-2"],
    reason: "有证据支持",
  },
]);

const insufficientVerification = createVerification(
  "NEEDS_REVISION",
  [
    {
      id: "claim-1",
      text: "useState 用于管理状态",
      verdict: "SUPPORTED",
      evidenceIds: ["evidence-1"],
      reason: "有证据支持",
    },
    {
      id: "claim-2",
      text: "useEffect 用于处理副作用",
      verdict: "UNKNOWN",
      evidenceIds: [],
      reason: "缺少证据",
    },
  ],
);

function createAgentOptions(): AgentControllerOptions {
    let decisionCalls = 0;
    return {
        maxSteps: 2,
        tools: {
        vector_search: {
            async execute(_input) {
            return {
                ok: true,
                data: [initialEvidence],
                metadata: { resultCount: 1 },
            };
            },
        },
        },
        async decide(_observation) {
            decisionCalls++;

            if (decisionCalls === 1) {
                return {
                done: false,
                action: {
                    tool: "vector_search",
                    input: {
                       query: "React useState useEffect",
                    },
                    reason:"先检索相关证据"
                },
                reason: "先检索相关证据",
                };
            }

            return {
                done: true,
                answer: "useState 管理状态，useEffect 处理副作用。",
                reason: "已有证据，可以生成答案",
            };
        }
    }
}

// 1. 初始答案已经通过验证，不应触发补充检索。
async function testAcceptWithoutRetrieval() {
  let retrieveCalls = 0;
  let generateCalls = 0;

  const result = await runSelfCorrectingAgent(
    "React Hooks 分别解决什么问题？",
    createAgentOptions(),
    {
      verify: async () => supportedVerification,
      retrieve: async () => {
        retrieveCalls++;
        return [additionalEvidence];
      },
      generateAnswer: async () => {
        generateCalls++;
        return "修正答案";
      },
    },
  );
  console.log(result,'result');
  assert.equal(result.status, "completed");
  assert.equal(retrieveCalls, 0);
  assert.equal(generateCalls, 0);
  assert.equal(result.answer, "useState 管理状态，useEffect 处理副作用。");

  console.log("PASS: 初始答案验证通过");
}

// 2. 初始答案证据不足，补充检索后重新生成并通过验证。
async function testSupplementAndAccept() {
  let verifyCalls = 0;
  let retrieveCalls = 0;
  let generateCalls = 0;

  const result = await runSelfCorrectingAgent(
    "React Hooks 分别解决什么问题？",
    createAgentOptions(),
    {
      verify: async () => {
        verifyCalls++;
        return verifyCalls === 1
          ? insufficientVerification
          : supportedVerification;
      },
      retrieve: async (query) => {
        retrieveCalls++;
        assert.ok(query.length > 0);
        return [additionalEvidence];
      },
      generateAnswer: async ({ evidence }) => {
        generateCalls++;
        assert.ok(evidence.length >= 2);
        return "useState 用于管理状态，useEffect 用于处理副作用。";
      },
      maxRetrievalAttempts: 2,
      maxCorrectionAttempts: 2,
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(verifyCalls, 2);
  assert.equal(retrieveCalls, 1);
  assert.equal(generateCalls, 1);

  console.log("PASS: 补充检索后重新生成并通过验证");
}

// 3. 补充检索异常时，必须安全终止。
async function testRetrievalFailure() {
  let generateCalls = 0;

  const result = await runSelfCorrectingAgent(
    "React Hooks 分别解决什么问题？",
    createAgentOptions(),
    {
      verify: async () => insufficientVerification,
      retrieve: async () => {
        throw new Error("MOCK_RETRIEVAL_ERROR");
      },
      generateAnswer: async () => {
        generateCalls++;
        return "不应该生成的答案";
      },
      maxRetrievalAttempts: 1,
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(generateCalls, 0);

  const trace = result.reflectionTrace;
  assert.ok(
    trace.some(
      (item) => item.errorCode === "RETRIEVAL_FAILED",
    ),
  );

  console.log("PASS: 补充检索异常安全终止");
}

// 4. 验证器异常时，不能返回未经验证的答案。
async function testVerificationFailure() {
  const result = await runSelfCorrectingAgent(
    "React Hooks 分别解决什么问题？",
    createAgentOptions(),
    {
      verify: async () => {
        throw new Error("MOCK_VERIFICATION_ERROR");
      },
      retrieve: async () => [additionalEvidence],
      generateAnswer: async () => "不应该返回的答案",
    },
  );

  assert.equal(result.status, "failed");
  assert.ok(
    result.reflectionTrace.some(
      (item) => item.errorCode === "VERIFICATION_FAILED",
    ),
  );

  console.log("PASS: 验证器异常安全终止");
}


const duplicateEvidence = {
    id: "evidence-1",
    content: "这是与初始证据不同的内容，但使用了相同 ID。",
  };
  
  // 5. 答案生成异常：必须安全终止。
  async function testAnswerGenerationFailure() {
    let generateCalls = 0;
  
    const result = await runSelfCorrectingAgent(
      "React Hooks 分别解决什么问题？",
      createAgentOptions(),
      {
        verify: async () => insufficientVerification,
        retrieve: async () => [additionalEvidence],
        generateAnswer: async () => {
          generateCalls++;
          throw new Error("MOCK_GENERATION_ERROR");
        },
        maxRetrievalAttempts: 1,
        maxCorrectionAttempts: 2,
      },
    );
  
    assert.equal(result.status, "failed");
    assert.equal(generateCalls, 1);
  
    assert.ok(
      result.reflectionTrace.some(
        (item) => item.errorCode === "ANSWER_GENERATION_FAILED",
      ),
    );
  
    console.log("PASS: 答案生成异常安全终止");
  }
  
  // 6. 达到最大修正次数：不得无限重新生成。
  async function testMaxCorrectionAttempts() {
    let verifyCalls = 0;
    let generateCalls = 0;
  
    const result = await runSelfCorrectingAgent(
      "React Hooks 分别解决什么问题？",
      createAgentOptions(),
      {
        verify: async () => {
          verifyCalls++;
          return insufficientVerification;
        },
        retrieve: async () => [additionalEvidence],
        generateAnswer: async () => {
          generateCalls++;
          return "仍然缺少证据的答案";
        },
        maxRetrievalAttempts: 1,
        maxCorrectionAttempts: 1,
      },
    );
  
    assert.equal(result.status, "failed");
  
    // 只能生成一次修正答案。
    assert.equal(generateCalls, 1);
  
    // 初始验证一次，修正答案验证一次。
    assert.equal(verifyCalls, 2);
  
    console.log("PASS: 最大修正次数限制");
  }
  
  // 7. 重复 Evidence ID：不能把不同内容的证据当成同一条证据。
  async function testDuplicateEvidenceId() {
    const result = await runSelfCorrectingAgent(
      "React Hooks 分别解决什么问题？",
      createAgentOptions(),
      {
        verify: async () => insufficientVerification,
        retrieve: async () => [duplicateEvidence],
        generateAnswer: async ({ evidence }) => {
          const ids = evidence.map((item: any) => item.id);
  
          // 所有证据 ID 必须唯一。
          assert.equal(
            new Set(ids).size,
            ids.length,
            "Evidence ID 必须唯一",
          );
  
          // 不允许静默丢弃内容不同的证据。
          assert.ok(
            evidence.some(
              (item: any) =>
                item.content === duplicateEvidence.content,
            ),
            "重复 ID 的不同证据内容不能被静默丢弃",
          );
  
          return "修正后的答案";
        },
        maxRetrievalAttempts: 1,
        maxCorrectionAttempts: 1,
      },
    );
  
    console.log(result,'result');
    assert.equal(result.status, "completed");
  
    console.log("PASS: 重复 Evidence ID 冲突处理");
  }
  
async function main() {
  await testAcceptWithoutRetrieval();
  await testSupplementAndAccept();
  await testRetrievalFailure();
  await testVerificationFailure();

  await testAnswerGenerationFailure(); 
  await testMaxCorrectionAttempts();
    await testDuplicateEvidenceId(); 
  console.log("\nV9.7.4 Self-Correction 回归测试通过");
}



main().catch((error) => {
  console.error("V9.7.4 回归测试失败:", error);
  process.exitCode = 1;
});

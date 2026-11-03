
import './env';
import assert from "node:assert/strict";

import {
  runSelfCorrectingAgent,
} from "../lib/self-correction";

import {
  type VerificationResult,
} from "../lib/answer-verifier";

import {
  type AgentControllerOptions,
} from "../lib/agent-controller";

async function main() {
  let decisionCalls = 0;
  let retrievalCalls = 0;
  let generationCalls = 0;
  let verificationCalls = 0;

  const agentOptions: AgentControllerOptions = {
    maxSteps: 3,

    tools: {
      vector_search: {
        async execute() {
          return {
            ok: true,
            data: [
              {
                id: "chunk-1",
                content:
                  "useState 是 React Hook，用于在函数组件中添加状态。",
                source: "react/hooks.md",
              },
            ],
            metadata: {
              resultCount: 1,
            },
          };
        },
      },
    },

    decide: async () => {
      decisionCalls++;

      // 第一轮：调用工具。
      if (decisionCalls === 1) {
        return {
          done: false,
          action: {
            tool: "vector_search",
            input: {
              query: "React useState",
              limit: 5,
            },
            reason: "获取初始证据",
          },
          reason: "INITIAL_RETRIEVAL",
        };
      }

      // 第二轮：生成初始答案。
      return {
        done: true,
        answer:
          "useState 可以管理整个应用的全局状态。",
        reason: "INITIAL_ANSWER",
      };
    },
  };

  const result = await runSelfCorrectingAgent(
    "React useState 的作用是什么？",
    agentOptions,
    {
      maxRetrievalAttempts: 2,
      maxCorrectionAttempts: 2,

      // 模拟补充检索。
      retrieve: async (query) => {
        retrievalCalls++;

        assert.ok(query.includes("useState"));

        return [
          {
            id: "chunk-2",
            content:
              "useState 用于在函数组件中添加和更新状态。",
            source: "react/hooks.md",
          },
        ];
      },

      // 模拟根据新增证据重新生成答案。
      generateAnswer: async ({ evidence }) => {
        generationCalls++;

        assert.ok(evidence.length > 0);

        return "useState 用于在函数组件中添加和更新状态。";
      },

      // 使用可控的验证器，避免测试依赖真实 LLM。
      verify: async ({ answer }) => {
        verificationCalls++;

        const passed = answer.includes("添加和更新状态");

        return {
          question: "React useState 的作用是什么？",
          answer,
          claims: [
            {
              id: "claim-1",
              text: "useState 用于在函数组件中添加和更新状态",
              verdict: passed
                ? "SUPPORTED"
                : "UNSUPPORTED",
              evidenceIds: passed
                ? ["chunk-2"]
                : [],
              reason: passed
                ? "证据支持该结论"
                : "当前答案没有得到证据支持",
            },
          ],
          verdict: passed ? "PASS" : "NEEDS_REVISION",
          supportRatio: passed ? 1 : 0,
          issues: passed
            ? []
            : [
                {
                  id: "claim-1",
                  text: "useState 可以管理整个应用的全局状态",
                  verdict: "UNSUPPORTED",
                  evidenceIds: [],
                  reason: "证据没有支持全局状态管理",
                },
              ],
          reason: passed ? "验证通过" : "证据不足",
        } satisfies VerificationResult;
      },
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "ANSWER_VERIFIED");

  assert.equal(result.reflectionTrace.length, 2);
  assert.equal(result.reflectionTrace[0].action, "SUPPLEMENT_RETRIEVAL");
  assert.equal(result.reflectionTrace[1].action, "ACCEPT");

  assert.equal(retrievalCalls, 1);
  assert.equal(generationCalls, 1);
  assert.equal(verificationCalls, 2);

  assert.ok(
    result.answer?.includes("添加和更新状态"),
  );

  console.log("V9.7.3 Self-Correction 测试通过");

  console.log({
    status: result.status,
    stopReason: result.stopReason,
    retrievalCalls,
    generationCalls,
    verificationCalls,
    reflectionTrace: result.reflectionTrace.map(
      (item) => ({
        round: item.round,
        verdict: item.verdict,
        action: item.action,
      }),
    ),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

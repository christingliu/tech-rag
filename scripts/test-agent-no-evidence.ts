
import './env';
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  let decideCalls = 0;
  let vectorCalls = 0;
  let keywordCalls = 0;

  const result = await runAgent(
    "知识库中不存在的主题应该如何回答？",
    {
      maxSteps: 3,

      tools: {
        vector_search: {
          async execute() {
            vectorCalls++;

            return {
              ok: true,
              data: [],
              metadata: { resultCount: 0 },
            };
          },
        },

        keyword_search: {
          async execute() {
            keywordCalls++;

            return {
              ok: true,
              data: [],
              metadata: { resultCount: 0 },
            };
          },
        },
      },

      async decide(observation) {
        decideCalls++;

        console.log("Decision round:", decideCalls);
        console.log("Completed steps:", observation.steps);
        console.log("Evidence:", observation.evidence);
        console.log("Last tool:", observation.lastTool);
        console.log("Last result:", observation.lastToolResult);

        if (observation.steps === 0) {
          return {
            done: false,
            reason: "先尝试向量检索",
            action: {
              tool: "vector_search",
              input: {
                query: observation.question,
                limit: 5,
              },
              reason: "首次检索",
            },
          };
        }

        if (observation.steps === 1) {
          assert.equal(observation.lastTool, "vector_search");

          const lastResult = observation.lastToolResult as {
            ok: boolean;
            metadata?: { resultCount?: number };
          };

          assert.equal(lastResult.ok, true);
          assert.equal(lastResult.metadata?.resultCount, 0);

          return {
            done: false,
            reason: "向量检索无结果，尝试关键词检索",
            action: {
              tool: "keyword_search",
              input: {
                query: observation.question,
                limit: 5,
              },
              reason: "切换检索策略",
            },
          };
        }

        // 两种检索均没有找到证据，拒绝编造答案。
        assert.equal(observation.steps, 2);
        assert.equal(observation.lastTool, "keyword_search");
        assert.equal(observation.evidence.length, 2);

        const allResultsEmpty = observation.evidence.every(
          (item) => Array.isArray(item) && item.length === 0,
        );

        assert.equal(allResultsEmpty, true);

        return {
          done: true,
          reason: "NO_EVIDENCE_FOUND",
          answer:
            "当前知识库没有检索到相关证据，因此无法根据现有资料可靠回答这个问题。",
        };
      },
    },
  );

  // 验证没有无限重试，也没有继续调用工具。
  assert.equal(vectorCalls, 1);
  assert.equal(keywordCalls, 1);
  assert.equal(decideCalls, 3);

  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "NO_EVIDENCE_FOUND");
  assert.equal(result.trace.length, 2);
  assert.equal(result.evidence.length, 2);

  assert.ok(result.answer);
  assert.match(result.answer, /无法.*回答/);

  console.log("\nV9.4.5.4 无有效证据测试通过");
  console.log("Vector calls:", vectorCalls);
  console.log("Keyword calls:", keywordCalls);
  console.log("Decision calls:", decideCalls);
  console.log("Trace:", result.trace);
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Answer:", result.answer);
}

main().catch((error) => {
  console.error("V9.4.5.4 测试失败:", error);
  process.exitCode = 1;
});

import './env';
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  let decideCalls = 0;
  let toolCalls = 0;

  const result = await runAgent(
    "测试 Agent 是否能在达到最大步数后停止",
    {
      maxSteps: 2,

      tools: {
        vector_search: {
          async execute() {
            toolCalls++;

            return {
              ok: true,
              data: [{ id: `chunk-${toolCalls}` }],
              metadata: { resultCount: 1 },
            };
          },
        },
      },

      async decide(observation) {
        decideCalls++;

        console.log("Decision round:", decideCalls);
        console.log("Completed steps:", observation.steps);

        // 故意每轮都要求继续检索，不返回最终答案。
        return {
          done: false,
          reason: "故意继续调用，用于测试最大步数限制",
          action: {
            tool: "vector_search",
            input: {
              query: observation.question,
              limit: 5,
            },
            reason: "测试执行预算",
          },
        };
      },
    },
  );

  assert.equal(decideCalls, 2);
  assert.equal(toolCalls, 2);
  assert.equal(result.trace.length, 2);
  assert.equal(result.status, "max_steps");
  assert.equal(result.stopReason, "MAX_STEPS_REACHED");
  assert.equal(result.evidence.length, 2);

  console.log("\nV9.4.5.1 最大步数测试通过");
  console.log("Decision calls:", decideCalls);
  console.log("Tool calls:", toolCalls);
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Evidence objects:", result.evidence.length);
}

main().catch((error) => {
  console.error("V9.4.5.1 测试失败:", error);
  process.exitCode = 1;
});

import './env';
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  let toolCalls = 0;
  let decideCalls = 0;

  const result = await runAgent(
    "测试工具失败后的 Agent 行为",
    {
      maxSteps: 3,

      tools: {
        vector_search: {
            async execute() {
                toolCalls++;
                throw new Error("模拟网络连接异常");
              },
        },
      },

      async decide(observation) {
        decideCalls++;

        console.log("Decision round:", decideCalls);
        console.log("Completed steps:", observation.steps);
        console.log("Last tool:", observation.lastTool);
        console.log("Last result:", observation.lastToolResult);

        if (decideCalls === 1) {
          return {
            done: false,
            reason: "尝试向量检索",
            action: {
              tool: "vector_search",
              input: {
                query: observation.question,
                limit: 5,
              },
              reason: "测试工具失败",
            },
          };
        }

        // 第二轮决策：看到失败结果后主动停止。
        return {
          done: true,
          answer: "检索工具执行失败，无法可靠回答。",
          reason: "TOOL_FAILURE_OBSERVED",
        };
      },
    },
  );

    assert.equal(decideCalls, 2);
    assert.equal(toolCalls, 1);

    assert.equal(result.trace.length, 1);
    assert.equal(result.trace[0].success, false);
    assert.equal(
    result.trace[0].errorCode,
    "TOOL_EXECUTION_FAILED",
    );

  console.log("\nV9.4.5.3 工具抛出异常的处理");
  console.log("Tool calls:", toolCalls);
  console.log("Decision calls:", decideCalls);
  console.log("Trace:", result.trace);
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Answer:", result.answer);
}

main().catch((error) => {
  console.error("V9.4.5.2 测试失败:", error);
  process.exitCode = 1;
});
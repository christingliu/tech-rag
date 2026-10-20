
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  let toolCalls = 0;
  let decideCalls = 0;
  let failureSeenByNextDecision = false;

  const result = await runAgent(
    "测试工具失败时的可观测性",
    {
      maxSteps: 3,

      tools: {
        vector_search: {
          async execute() {
            toolCalls++;

            return {
              ok: false,
              error: {
                code: "VECTOR_SEARCH_FAILED",
                message: "模拟向量数据库连接失败",
              },
              metadata: {
                resultCount: 0,
              },
            };
          },
        },
      },

      async decide(observation) {
        decideCalls++;

        console.log("Decision round:", decideCalls);
        console.log("Completed steps:", observation.steps);

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
              reason: "验证失败路径",
            },
          };
        }

        // 检查下一轮是否看到了失败结果。
        const lastResult = observation.lastToolResult as {
          ok: boolean;
          error?: {
            code?: string;
            message?: string;
          };
        };

        assert.equal(observation.lastTool, "vector_search");
        assert.equal(lastResult.ok, false);
        assert.equal(
          lastResult.error?.code,
          "VECTOR_SEARCH_FAILED",
        );
        assert.equal(
          lastResult.error?.message,
          "模拟向量数据库连接失败",
        );

        failureSeenByNextDecision = true;

        return {
          done: true,
          reason: "TOOL_FAILURE_OBSERVED",
          answer: "检索失败，无法根据当前结果可靠回答。",
        };
      },
    },
  );

  // 1. 验证调用次数与执行轨迹。
  assert.equal(toolCalls, 1);
  assert.equal(decideCalls, 2);
  assert.equal(failureSeenByNextDecision, true);
  assert.equal(result.trace.length, 1);

  // 2. 验证 Trace 中的失败诊断信息。
  const trace = result.trace[0];

  assert.equal(trace.action.tool, "vector_search");
  assert.equal(trace.success, false);
  assert.equal(trace.errorCode, "VECTOR_SEARCH_FAILED");
  assert.equal(trace.resultCount, 0);
  assert.ok(
    typeof trace.durationMs === "number" &&
      trace.durationMs >= 0,
  );

  // 3. 验证 Agent 的结束状态。
  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "TOOL_FAILURE_OBSERVED");

  console.log("\nV9.4.6.2.1 失败路径可观测性测试通过");
  console.log("Failure visible to next decision:", failureSeenByNextDecision);
  console.log("Trace:", result.trace);
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
}

main().catch((error) => {
  console.error("V9.4.6.2.1 测试失败:", error);
  process.exitCode = 1;
});

import "./env";
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  let vectorCalls = 0;
  let decideCalls = 0;

  // 每一轮都故意返回完全相同的工具和参数。
  const result = await runAgent(
    "React 的 useState 是什么？",
    {
      maxSteps: 4,

      tools: {
        vector_search: {
          async execute(input) {
            vectorCalls++;

            console.log("实际执行 vector_search:", input);

            // 模拟检索成功，但没有任何结果。
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

        console.log(
          `决策轮次 ${decideCalls}，已执行步骤 ${observation.steps}`,
        );

        // 故意忽略重复调用提示，持续请求相同调用，
        // 用来验证 Controller 能否在工具执行前拦截。
        return {
          done: false,
          reason: "测试：故意重复调用",
          action: {
            tool: "vector_search",
            input: {
              query: "React 的 useState 是什么？",
              limit: 5,
            },
            reason: "测试重复调用保护",
          },
        };
      },
    },
  );

  console.log("\n测试结果：", {
    status: result.status,
    stopReason: result.stopReason,
    vectorCalls,
    decideCalls,
    traceLength: result.trace.length,
  });

  // 核心断言：工具只能实际执行一次。
  assert.equal(
    vectorCalls,
    1,
    "失败：相同工具和参数被重复执行了",
  );

  // 只应有首次真实工具调用的执行轨迹。
  assert.equal(
    result.trace.length,
    1,
    "失败：重复调用被写入了实际执行轨迹",
  );

  // 按当前重复调用保护的设计，第二次重复拦截后终止。
  assert.equal(
    result.stopReason,
    "REPEATED_TOOL_CALL_BLOCKED",
    "失败：Agent 未按预期因重复调用而终止",
  );

  console.log("\nV9.5 相同工具、相同参数重复调用保护测试通过");
}

main().catch((error) => {
  console.error("重复调用保护测试失败：", error);
  process.exitCode = 1;
});

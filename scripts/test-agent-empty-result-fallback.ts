
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  const toolCalls: string[] = [];
  let decisionCalls = 0;

  const result = await runAgent(
    "确认 useState 与 React 的关系；如果图谱没有证据，尝试关键词检索。",
    {
      maxSteps: 4,

      tools: {
        entity_lookup: {
          async execute(input) {
            toolCalls.push("entity_lookup");

            assert.equal(input.entity, "useState");

            return {
              ok: true,
              data: {
                status: "resolved",
                entity: "useState",
                selectedId: "use-state",
              },
              metadata: { resultCount: 1 },
            };
          },
        },

        graph_search: {
          async execute(input) {
            toolCalls.push("graph_search");

            assert.equal(input.query, "useState React");

            // 模拟工具正常执行，但没有检索到结果。
            return {
              ok: true,
              data: {
                edges: [],
                chunks: [],
              },
              metadata: { resultCount: 0 },
            };
          },
        },

        keyword_search: {
          async execute(input) {
            toolCalls.push("keyword_search");

            assert.equal(
              typeof input.query,
              "string",
            );

            return {
              ok: true,
              data: {
                chunks: [
                  {
                    source: "react/state.md",
                    content:
                      "useState 是 React 提供的 Hook，用于在函数组件中管理状态。",
                  },
                ],
              },
              metadata: { resultCount: 1 },
            };
          },
        },
      },

      async decide(observation) {
        decisionCalls++;

        if (decisionCalls === 1) {
          return {
            done: false,
            reason: "先确认实体身份",
            action: {
              tool: "entity_lookup",
              input: {
                entity: "useState",
                context: "确认 React Hook 的实体身份",
              },
              reason: "确认实体",
            },
          };
        }

        if (decisionCalls === 2) {
          assert.equal(observation.lastTool, "entity_lookup");

          return {
            done: false,
            reason: "查询实体之间的显式关系",
            action: {
              tool: "graph_search",
              input: {
                query: "useState React",
                maxHops: 2,
              },
              reason: "检索图谱关系",
            },
          };
        }

        if (decisionCalls === 3) {
          assert.equal(observation.lastTool, "graph_search");

          const lastResult = observation.lastToolResult as {
            ok: boolean;
            metadata?: { resultCount?: number };
            data?: { chunks?: unknown[] };
          };

          // 核心断言：图谱工具成功执行，但结果为空。
          assert.equal(lastResult.ok, true);
          assert.equal(lastResult.metadata?.resultCount, 0);
          assert.equal(lastResult.data?.chunks?.length, 0);

          // 必须切换工具，而不是重复 graph_search。
          return {
            done: false,
            reason: "图谱没有返回证据，改用关键词检索",
            action: {
              tool: "keyword_search",
              input: {
                query: "useState React Hook 组件状态",
              },
              reason: "图谱结果为空，尝试关键词检索",
            },
          };
        }

        assert.equal(decisionCalls, 4);
        assert.equal(observation.lastTool, "keyword_search");

        const lastResult = observation.lastToolResult as {
          ok: boolean;
          metadata?: { resultCount?: number };
          data?: { chunks?: unknown[] };
        };

        assert.equal(lastResult.ok, true);
        assert.equal(lastResult.metadata?.resultCount, 1);
        assert.equal(lastResult.data?.chunks?.length, 1);

        return {
          done: true,
          reason: "关键词检索已找到可用证据",
          answer:
            "useState 是 React 提供的 Hook，用于管理函数组件的状态。",
        };
      },
    },
  );

  // 1. 验证工具切换路径。
  assert.deepEqual(toolCalls, [
    "entity_lookup",
    "graph_search",
    "keyword_search",
  ]);

  // 2. 验证决策轮数。
  assert.equal(decisionCalls, 4);

  // 3. 验证正常结束。
  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "LLM_FINAL_ANSWER");
  assert.ok(result.answer?.includes("useState"));

  // 4. 验证每一步的工具轨迹。
  assert.equal(result.trace.length, 3);
  assert.equal(result.trace[0].success, true);
  assert.equal(result.trace[1].success, true);
  assert.equal(result.trace[2].success, true);

  assert.equal(result.trace[1].resultCount, 0);
  assert.equal(result.trace[2].resultCount, 1);

  console.log("V9.5.2 空结果策略切换测试通过");
  console.log("Tool calls:", toolCalls);
  console.log("Decision calls:", decisionCalls);
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.dir(result.trace, { depth: null });
}

main().catch((error) => {
  console.error("V9.5.2 测试失败:", error);
  process.exitCode = 1;
});

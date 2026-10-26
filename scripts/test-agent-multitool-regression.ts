
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-controller";

async function main() {
  const toolCalls: string[] = [];
  let decisionCalls = 0;

  const result = await runAgent(
    "确认 useState 与 React 的关系",
    {
      maxSteps: 3,

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

            return {
              ok: true,
              data: {
                edges: [
                  {
                    id: "edge-2",
                    source: "use-state",
                    target: "react",
                    type: "belongs_to",
                  },
                ],
                chunks: [
                  {
                    source: "react/state.md",
                    content:
                      "useState 是 React 提供的 Hook。",
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

        // 第一轮：查询实体。
        if (decisionCalls === 1) {
          assert.equal(observation.steps, 0);

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

        // 第二轮：必须能看到上一步工具的结果。
        if (decisionCalls === 2) {
          assert.equal(observation.steps, 1);
          assert.equal(observation.lastTool, "entity_lookup");

          const lastResult = observation.lastToolResult as {
            ok: boolean;
            data?: { selectedId?: string };
          };

          assert.equal(lastResult.ok, true);
          assert.equal(
            lastResult.data?.selectedId,
            "use-state",
          );

          return {
            done: false,
            reason: "实体已确认，查询显式关系",
            action: {
              tool: "graph_search",
              input: {
                query: "useState React",
                maxHops: 2,
              },
              reason: "检索实体关系",
            },
          };
        }

        // 第三轮：必须能看到图谱证据，并结束任务。
        assert.equal(decisionCalls, 3);
        assert.equal(observation.steps, 2);
        assert.equal(observation.lastTool, "graph_search");
        assert.equal(observation.evidence.length, 2);

        return {
          done: true,
          reason: "已有图谱关系和文档证据",
          answer:
            "useState 属于 React，并用于管理组件状态。",
        };
      },
    },
  );

  // 验证执行顺序和决策次数。
  assert.deepEqual(toolCalls, [
    "entity_lookup",
    "graph_search",
  ]);
  assert.equal(decisionCalls, 3);

  // 验证 Agent 正常结束。
  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "LLM_FINAL_ANSWER");
  assert.ok(result.answer?.includes("React"));

  // 验证工具轨迹。
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace[0].success, true);
  assert.equal(result.trace[1].success, true);
  assert.equal(result.trace[0].resultCount, 1);
  assert.equal(result.trace[1].resultCount, 1);

  console.log("V9.5.1 多工具协作回归测试通过");
  console.log("Tool calls:", toolCalls);
  console.log("Decision calls:", decisionCalls);
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Trace:", result.trace);
}

main().catch((error) => {
  console.error("V9.5.1 测试失败:", error);
  process.exitCode = 1;
});

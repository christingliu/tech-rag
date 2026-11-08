import "./env";

import assert from "node:assert/strict";

import { runAgent } from "../lib/agent-controller";
import { createAgentTools } from "../lib/agent-tools";

async function main() {
  const tools = createAgentTools();

  assert.ok(
    tools.graph_vector_search,
    "graph_vector_search 应该已经注册",
  );

  let decisionCount = 0;

  const result = await runAgent(
    "useState 如何管理组件状态？",
    {
      maxSteps: 3,
      tools,

      // 使用 Mock Decider，确定性验证工具执行链。
      decide: async () => {
        decisionCount += 1;

        if (decisionCount === 1) {
          return {
            done: false,
            action: {
              tool: "graph_vector_search",
              input: {
                query: "useState 如何管理组件状态？",
                vectorTopK: 5,
                maxHops: 1,
              },
              reason: "同时需要语义证据和图谱关系",
            },
            reason: "TEST_GRAPH_VECTOR_SEARCH",
          };
        }

        return {
          done: true,
          answer: "测试结束",
          reason: "TEST_COMPLETED",
        };
      },
    },
  );

  assert.equal(result.status, "completed");

  assert.equal(
    result.trace[0]?.action.tool,
    "graph_vector_search",
  );

  assert.equal(
    result.trace[0]?.success,
    true,
  );

  assert.ok(result.evidence.length > 0);

  const hybridResult = result.evidence[0] as {
    evidence?: unknown[];
    vector?: { status: string };
    graph?: { status: string };
  };

  assert.ok(Array.isArray(hybridResult.evidence));

  assert.ok(hybridResult.vector);
  assert.ok(hybridResult.graph);

  console.log("V9.8.3 Agent Graph + Vector 测试通过");

  console.log({
    status: result.status,
    tool: result.trace[0]?.action.tool,
    evidenceCount: hybridResult.evidence.length,
    vectorStatus: hybridResult.vector?.status,
    graphStatus: hybridResult.graph?.status,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
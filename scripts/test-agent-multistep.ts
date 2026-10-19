
import './env';
import assert from "node:assert/strict";

import {
  runAgent,
  type AgentObservation,
} from "../lib/agent-controller";

async function main() {
  const observations: AgentObservation[] = [];

  const tools = {
    vector_search: {
      async execute() {
        // 第一次检索：成功执行，但没有检索结果。
        return {
          ok: true,
          data: [],
          metadata: { resultCount: 0 },
        };
      },
    },

    keyword_search: {
      async execute() {
        // 第二次检索：返回两条模拟证据。
        return {
          ok: true,
          data: [
            { id: "chunk-1", content: "useState 用于管理组件状态" },
            { id: "chunk-2", content: "useEffect 用于处理副作用" },
          ],
          metadata: { resultCount: 2 },
        };
      },
    },
  };

  const result = await runAgent(
    "React 的 useState 和 useEffect 分别解决什么问题？",
    {
      maxSteps: 3,
      tools,

      async decide(observation) {
        observations.push({
          ...observation,
          // 保存独立快照，避免后续 evidence.push
          // 改变之前记录的数组内容。
          evidence: [...observation.evidence],
        });

        // 第 1 轮：选择向量检索。
        if (observation.steps === 0) {
          return {
            done: false,
            reason: "先尝试向量检索",
            action: {
              tool: "vector_search",
              input: { query: observation.question, limit: 5 },
              reason: "首次检索",
            },
          };
        }

        // 第 2 轮：验证第一轮状态已经传入决策器。
        if (observation.steps === 1) {
          assert.equal(observation.lastTool, "vector_search");
          assert.equal(observation.evidence.length, 1);
          assert.deepEqual(observation.evidence[0], []);

          const lastResult = observation.lastToolResult as {
            ok: boolean;
            metadata?: { resultCount?: number };
          };

          assert.equal(lastResult.ok, true);
          assert.equal(lastResult.metadata?.resultCount, 0);

          return {
            done: false,
            reason: "向量检索为空，切换关键词检索",
            action: {
              tool: "keyword_search",
              input: { query: observation.question, limit: 5 },
              reason: "首次检索没有结果",
            },
          };
        }

        // 第 3 轮：验证两轮结果均被累积。
        assert.equal(observation.steps, 2);
        assert.equal(observation.lastTool, "keyword_search");
        assert.equal(observation.evidence.length, 2);

        const keywordEvidence = observation.evidence[1] as {
          id: string;
          content: string;
        }[];

        assert.equal(keywordEvidence.length, 2);
        assert.equal(keywordEvidence[0].id, "chunk-1");
        assert.equal(keywordEvidence[1].id, "chunk-2");

        return {
          done: true,
          reason: "MULTISTEP_TEST_COMPLETED",
          answer:
            "useState 用于管理组件状态；useEffect 用于处理副作用。",
        };
      },
    },
  );

  // 验证整个执行流程。
  assert.equal(result.status, "completed");
  assert.equal(result.trace.length, 2);
  assert.deepEqual(
    result.trace.map((item) => item.action.tool),
    ["vector_search", "keyword_search"],
  );
  assert.equal(result.evidence.length, 2);
  assert.equal(observations.length, 3);

  console.log("V9.4.4 多轮状态传递测试通过");
  console.log("Tool sequence:", result.trace.map((item) => item.action.tool));
  console.log("Decision rounds:", observations.length);
  console.log("Evidence result objects:", result.evidence.length);
  console.log("Keyword evidence count:", (
    result.evidence[1] as unknown[]
  ).length);
  console.log("Answer:", result.answer);
}

main().catch((error) => {
  console.error("V9.4.4 测试失败:", error);
  process.exitCode = 1;
});
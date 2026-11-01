
import assert from "node:assert/strict";
import { aggregateEvidence } from "../lib/evidence-aggregator";
import type { QueryTaskExecutionResult } from "../lib/query-task-executor";

const result: QueryTaskExecutionResult = {
  originalQuestion: "如何比较 useState 和 useEffect？",
  tasks: [
    {
      taskId: "task-1",
      question: "useState 的作用",
      goal: "状态管理",
      status: "completed",
      attempts: [
        {
          tool: "vector_search",
          ok: true,
          resultCount: 1,
        },
      ],
      evidence: [
        {
          taskId: "task-1",
          tool: "vector_search",
          data: [
            { id: "chunk-1", content: "useState 用于管理组件状态。" },
            { id: "chunk-2", content: "useState 用于管理组件状态。" },
          ],
        },
      ],
    },
    {
      taskId: "task-2",
      question: "useEffect 的作用",
      goal: "副作用处理",
      status: "completed",
      attempts: [
        {
          tool: "keyword_search",
          ok: true,
          resultCount: 1,
        },
      ],
      evidence: [
        {
          taskId: "task-2",
          tool: "keyword_search",
          data: [
            // 与 task-1 的 chunk-1 内容相同，
            // 应被去重，但仍保留两个任务的来源。
            { id: "chunk-3", content: "useState 用于管理组件状态。" },
            { id: "chunk-4", content: "useEffect 用于处理副作用。" },
          ],
        },
      ],
    },
    {
      taskId: "task-3",
      question: "两者的区别",
      goal: "比较职责",
      status: "no_evidence",
      attempts: [
        {
          tool: "vector_search",
          ok: true,
          resultCount: 0,
        },
        {
          tool: "keyword_search",
          ok: true,
          resultCount: 0,
        },
      ],
      evidence: [],
    },
  ],
};

async function main() {
  const aggregated = aggregateEvidence(result);
  console.log(aggregated,'aggregated');
  // chunk ID 不同，但文本相同，因此合并为同一条证据。
  const stateEvidence = aggregated.evidence.find(
    (item) =>
      item.data !== null &&
      typeof item.data === "object" &&
      "content" in item.data &&
      item.data.content === "useState 用于管理组件状态。",
  );

  assert.ok(stateEvidence);
  assert.equal(stateEvidence.occurrences, 3);
  assert.deepEqual(stateEvidence.taskIds, ["task-1", "task-2"]);
  assert.deepEqual(stateEvidence.tools, [
    "vector_search",
    "keyword_search",
  ]);

  assert.equal(aggregated.evidence.length, 2);
  assert.equal(aggregated.coveredTaskCount, 2);
  assert.equal(aggregated.totalTaskCount, 3);
  assert.equal(aggregated.coverageRatio, 2 / 3);
  assert.deepEqual(aggregated.missingTaskIds, ["task-3"]);
  assert.deepEqual(aggregated.failedTaskIds, []);
  assert.equal(aggregated.canAnswer, false);

  console.log("V9.6.3 证据聚合测试通过");
  console.dir(aggregated, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

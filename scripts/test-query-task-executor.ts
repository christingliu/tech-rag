
import assert from "node:assert/strict";
import type {
  AgentTool,
  AgentToolName,
} from "../lib/agent-controller";
import {
  executeQueryPlan,
} from "../lib/query-task-executor";
import type {
  QueryPlan,
} from "../lib/query-planner";

const calls: string[] = [];

function mockTool(
  name: string,
  hasResults: boolean,
): AgentTool {
  return {
    async execute(input) {
      const query = String(input.query);
      calls.push(`${name}:${query}`);

      return {
        ok: true,
        data: hasResults
          ? [{ source: `${name}-doc`, content: query }]
          : [],
        metadata: {
          resultCount: hasResults ? 1 : 0,
        },
      };
    },
  };
}

async function main() {
  const tools: Partial<Record<AgentToolName, AgentTool>> = {
    vector_search: mockTool("vector", false),
    keyword_search: mockTool("keyword", true),
  };

  const plan: QueryPlan = {
    originalQuestion: "如何比较 useState 和 useEffect？",
    tasks: [
      {
        id: "task-4",
        question: "总结常见问题",
        goal: "总结使用注意事项",
        dependsOn: ["task-1", "task-2", "task-3"],
      },
      {
        id: "task-1",
        question: "useState 的作用",
        goal: "了解状态管理",
        dependsOn: [],
      },
      {
        id: "task-2",
        question: "useEffect 的作用",
        goal: "了解副作用处理",
        dependsOn: [],
      },
      {
        id: "task-3",
        question: "两者的区别",
        goal: "对比职责",
        dependsOn: [],
      },
    ],
  };

  const result = await executeQueryPlan(plan, tools);

  // 输出保持原始计划顺序。
  assert.deepEqual(
    result.tasks.map((task) => task.taskId),
    ["task-4", "task-1", "task-2", "task-3"],
  );

  // task-4 虽然排在首位，但实际执行时必须等待依赖任务。
  assert.ok(
    calls.indexOf("vector:useState 的作用") <
      calls.indexOf("vector:总结常见问题"),
  );

  // 向量检索为空时切换关键词检索。
  assert.equal(result.tasks[0].attempts.length, 2);
  assert.equal(result.tasks[0].attempts[0].tool, "vector_search");
  assert.equal(result.tasks[0].attempts[1].tool, "keyword_search");

  // 每个子任务的证据都带有 taskId。
  for (const task of result.tasks) {
    assert.equal(task.status, "completed");
    assert.ok(task.evidence.length > 0);
    assert.ok(
      task.evidence.every((item) => item.taskId === task.taskId),
    );
  }

  console.log("V9.6.2 子任务检索执行测试通过");
  console.log("实际执行顺序:", calls);
  console.log(
    "各任务证据数:",
    result.tasks.map((task) => ({
      taskId: task.taskId,
      evidenceCount: task.evidence.length
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

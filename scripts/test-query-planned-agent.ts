
import './env';
import assert from "node:assert/strict";
import { runQueryPlannedAgent } from "../lib/query-planned-agent";
import type {
  AgentTool,
  AgentToolName,
} from "../lib/agent-controller";
import type { QueryPlan } from "../lib/query-planner";

const plan: QueryPlan = {
  originalQuestion: "useState 和 useEffect 有什么区别？",
  tasks: [
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
  ],
};

function createTools(
  includeEffectEvidence: boolean,
): Partial<Record<AgentToolName, AgentTool>> {
  function createSearchTool(
    toolName: string,
  ): AgentTool {
    return {
      async execute(input) {
        const query = String(input.query);
        const isEffectQuery = query.includes("useEffect");

        const hasEvidence =
          !isEffectQuery || includeEffectEvidence;

        const data = hasEvidence
          ? [
              {
                id: isEffectQuery ? "effect-1" : "state-1",
                content: isEffectQuery
                  ? "useEffect 用于处理副作用。"
                  : "useState 用于管理组件状态。",
              },
            ]
          : [];

        return {
          ok: true,
          data,
          metadata: { resultCount: data.length },
        };
      },
    };
  }

  return {
    vector_search: createSearchTool("vector_search"),
    keyword_search: createSearchTool("keyword_search"),
  };
}

async function main() {
  // 场景一：所有任务均有证据，生成最终答案。
/*   let generationCalls = 0;

  const success = await runQueryPlannedAgent(
    plan.originalQuestion,
    {
      planQuestion: async () => plan,
      tools: createTools(true),
      generateAnswer: async () => {
        generationCalls += 1;
        return "useState 用于管理状态；useEffect 用于处理副作用。";
      },
    },
  ); */

/*   assert.equal(success.status, "completed");
  assert.equal(success.stopReason, "QUERY_PLANNING_COMPLETED");
  assert.ok(success.answer);
  assert.equal(success.aggregation?.canAnswer, true);
  assert.equal(generationCalls, 1); */

  // 场景二：一个子任务无证据，不应生成答案。
 /*  const failure = await runQueryPlannedAgent(
    plan.originalQuestion,
    {
      planQuestion: async () => plan,
      tools: createTools(false),
      generateAnswer: async () => {
        throw new Error("证据不足时不应调用生成器");
      },
    },
  ); */

/*   assert.equal(failure.status, "failed");
  assert.equal(
    failure.stopReason,
    "INSUFFICIENT_TASK_COVERAGE",
  );
  assert.equal(failure.answer, undefined);
  assert.deepEqual(
    failure.aggregation?.missingTaskIds,
    ["task-2"],
  );

  assert.ok(
    success.trace.some(
      (event) => event.event === "generation_completed",
    ),
  );

  assert.ok(
    failure.trace.some(
      (event) => event.event === "aggregation_completed",
    ),
  );

  assert.ok(
    !failure.trace.some(
      (event) => event.event === "generation_started",
    ),
  ); */

/*   console.log("V9.6.4 Query Planning 闭环测试通过");
  console.log("成功路径:", success.stopReason);
  console.log("证据不足路径:", failure.stopReason); */

  //真实调用
  const result = await runQueryPlannedAgent(
    "React 的 useState 和 useEffect 有什么区别？分别适用于什么场景？使用时有哪些常见问题？",
  );
  
  console.dir(result, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

 //手动的真实模拟调动



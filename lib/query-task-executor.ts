
import type {
    AgentTool,
    AgentToolName,
  } from "./agent-controller";
  import type {
    QueryPlan,
    QueryTask,
  } from "./query-planner";
  
  export interface TaskToolAttempt {
    tool: "vector_search" | "keyword_search";
    ok: boolean;
    resultCount: number;
    errorCode?: string;
  }
  
  export interface TaskRetrievalResult {
    taskId: string;
    question: string;
    goal: string;
    status: "completed" | "no_evidence" | "failed";
    evidence: Array<{
      taskId: string;
      tool: "vector_search" | "keyword_search";
      data: unknown;
    }>;
    attempts: TaskToolAttempt[];
  }
  
  export interface QueryTaskExecutionResult {
    originalQuestion: string;
    tasks: TaskRetrievalResult[];
  }
  
  type SearchToolName = "vector_search" | "keyword_search";
  
  type ToolResult = Awaited<ReturnType<AgentTool["execute"]>>;
  
  function getResultCount(result: ToolResult): number {
    if (typeof result.metadata?.resultCount === "number") {
      return Math.max(0, result.metadata.resultCount);
    }
  
    const data = result.data;
  
    if (Array.isArray(data)) {
      return data.length;
    }
  
    if (data && typeof data === "object") {
      const value = data as Record<string, unknown>;
  
      if (Array.isArray(value.chunks)) {
        return value.chunks.length;
      }
  
      if (Array.isArray(value.evidence)) {
        return value.evidence.length;
      }
    }
  
    return 0;
  }
  
  function orderTasks(tasks: QueryTask[]): QueryTask[] {
    const byId = new Map(tasks.map((task) => [task.id, task]));
  
    if (byId.size !== tasks.length) {
      throw new Error("DUPLICATE_QUERY_TASK_ID");
    }
  
    for (const task of tasks) {
      for (const dependency of task.dependsOn) {
        if (!byId.has(dependency)) {
          throw new Error("INVALID_QUERY_TASK_DEPENDENCY");
        }
      }
    }
  
    const ordered: QueryTask[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
  
    function visit(task: QueryTask): void {
      if (visiting.has(task.id)) {
        throw new Error("QUERY_PLAN_DEPENDENCY_CYCLE");
      }
  
      if (visited.has(task.id)) {
        return;
      }
  
      visiting.add(task.id);
  
      for (const dependency of task.dependsOn) {
        visit(byId.get(dependency)!);
      }
  
      visiting.delete(task.id);
      visited.add(task.id);
      ordered.push(task);
    }
  
    for (const task of tasks) {
      visit(task);
    }
  
    return ordered;
  }
  
  async function executeTask(
    task: QueryTask,
    tools: Partial<Record<AgentToolName, AgentTool>>,
    limit: number,
  ): Promise<TaskRetrievalResult> {
    const attempts: TaskToolAttempt[] = [];
    const evidence: TaskRetrievalResult["evidence"] = [];
  
    let hadSuccessfulCall = false;
  
    const searchTools: SearchToolName[] = [
      "vector_search",
      "keyword_search",
    ];
  
    for (const toolName of searchTools) {
      const tool = tools[toolName];
  
      if (!tool) {
        continue;
      }
  
      let result: ToolResult;
  
      try {
        result = await tool.execute({
          query: task.question,
          limit,
        });
      } catch (error) {
        attempts.push({
          tool: toolName,
          ok: false,
          resultCount: 0,
          errorCode:
            error instanceof Error
              ? error.message
              : "TOOL_EXECUTION_FAILED",
        });
  
        continue;
      }
  
      const resultCount = getResultCount(result);
  
      attempts.push({
        tool: toolName,
        ok: result.ok,
        resultCount,
        ...(!result.ok
          ? { errorCode: result.error?.code ?? "TOOL_FAILED" }
          : {}),
      });
  
      if (!result.ok) {
        continue;
      }
  
      hadSuccessfulCall = true;
  
      if (resultCount > 0 && result.data != null) {
        evidence.push({
          taskId: task.id,
          tool: toolName,
          data: result.data,
        });
  
        // 有结果就结束该任务的检索；
        // 没有结果才切换到下一个检索策略。
        break;
      }
    }
  
    return {
      taskId: task.id,
      question: task.question,
      goal: task.goal,
      status:
        evidence.length > 0
          ? "completed"
          : hadSuccessfulCall
            ? "no_evidence"
            : "failed",
      evidence,
      attempts,
    };
  }
  
  export async function executeQueryPlan(
    plan: QueryPlan,
    tools: Partial<Record<AgentToolName, AgentTool>>,
    options: { limit?: number } = {},
  ): Promise<QueryTaskExecutionResult> {
    const limit = options.limit ?? 5;
  
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new Error("INVALID_QUERY_TASK_LIMIT");
    }
  
    if (!plan.originalQuestion.trim() || plan.tasks.length === 0) {
      throw new Error("INVALID_QUERY_PLAN");
    }
  
    const orderedTasks = orderTasks(plan.tasks);
    const completedIds = new Set<string>();
    const results: TaskRetrievalResult[] = [];
  
    for (const task of orderedTasks) {
      if (!task.dependsOn.every((id) => completedIds.has(id))) {
        throw new Error("QUERY_TASK_DEPENDENCY_NOT_COMPLETED");
      }
  
      const result = await executeTask(task, tools, limit);
    
      console.dir(result,{deepth:null});
      results.push(result);
      completedIds.add(task.id);
    }
    console.dir(results, {deepth : 5});
  
    // 保留原始计划的任务顺序，方便和 Planner 输出对照。
    const resultById = new Map(results.map((result) => [result.taskId, result]));
  
    return {
      originalQuestion: plan.originalQuestion,
      tasks: plan.tasks.map((task) => resultById.get(task.id)!),
    };
  }
  
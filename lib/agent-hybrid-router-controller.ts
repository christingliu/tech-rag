
export type AgentToolName =
  | "vector_search"
  | "keyword_search"
  | "graph_search";

export type AgentRouteSource = "rule" | "llm" | "fallback";

export type AgentRoute =
  | {
      type: "tool";
      tool: AgentToolName;
      reason: string;
    }
  | {
      type: "direct_answer";
      reason: string;
    };

export interface AgentRoutingDecision {
  route: AgentRoute;
  source: AgentRouteSource;
  fallbackReason?: string;
}

export interface AgentRoutingState {
  initialRoute?: AgentRoute;
  routerSource?: AgentRouteSource;
  fallbackReason?: string;
}

export interface AgentAction {
  tool: AgentToolName;
  input: Record<string, unknown>;
  reason: string;
}

export interface AgentObservation {
  question: string;
  steps: number;
  evidence: unknown[];
  lastTool?: AgentToolName;
  lastToolResult?: unknown;
  routing?: AgentRoutingState;
}

export interface AgentDecision {
  action?: AgentAction;
  done: boolean;
  answer?: string;
  reason: string;
}

export interface AgentTrace {
  step: number;
  action: AgentAction;
  success: boolean;
  resultCount?: number;
  errorCode?: string;
  durationMs: number;
}

export interface AgentRunResult {
  status: "completed" | "max_steps" | "failed";
  answer?: string;
  evidence: unknown[];
  trace: AgentTrace[];
  stopReason: string;
  routing?: AgentRoutingState;
}

export interface AgentTool {
  execute(
    input: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    metadata?: {
      resultCount?: number;
    };
    error?: {
      code: string;
      message: string;
    };
  }>;
}

export interface AgentControllerOptions {
  maxSteps?: number;
  tools: Partial<Record<AgentToolName, AgentTool>>;
  decide: (
    observation: AgentObservation,
  ) => Promise<AgentDecision>;

  // 可选：接入规则路由 / LLM 路由 / 混合路由
  initialRouter?: (
    question: string,
  ) => Promise<AgentRoutingDecision>;
}

export async function runAgent(
  question: string,
  options: AgentControllerOptions,
): Promise<AgentRunResult> {
  const maxSteps = options.maxSteps ?? 4;

  if (!question.trim()) {
    return {
      status: "failed",
      evidence: [],
      trace: [],
      stopReason: "EMPTY_QUESTION",
    };
  }

  if (
    !Number.isInteger(maxSteps) ||
    maxSteps < 1 ||
    maxSteps > 10
  ) {
    throw new Error("maxSteps 必须是 1～10 的整数");
  }

  const evidence: unknown[] = [];
  const trace: AgentTrace[] = [];

  let lastTool: AgentToolName | undefined;
  let lastToolResult: unknown;

  let routing: AgentRoutingState | undefined;
  let initialAction: AgentAction | undefined;
  let directAnswerRoute = false;

  // 1. 初始化路由。未配置 Router 时，保持原有行为。
  if (options.initialRouter) {
    let routeResult: AgentRoutingDecision;

    try {
      routeResult = await options.initialRouter(question);
    } catch {
      // Router 本身异常时，尝试使用已注册的向量检索降级。
      if (!options.tools.vector_search) {
        return {
          status: "failed",
          evidence,
          trace,
          stopReason: "ROUTER_FAILED_NO_FALLBACK_TOOL",
        };
      }

      routeResult = {
        route: {
          type: "tool",
          tool: "vector_search",
          reason: "ROUTER_EXECUTION_FAILED",
        },
        source: "fallback",
        fallbackReason: "ROUTER_EXECUTION_FAILED",
      };
    }

    routing = {
      initialRoute: routeResult.route,
      routerSource: routeResult.source,
      fallbackReason: routeResult.fallbackReason,
    };

    if (routeResult.route.type === "tool") {
      initialAction = {
        tool: routeResult.route.tool,
        input: { query: question },
        reason: routeResult.route.reason,
      };
    } else {
      directAnswerRoute = true;
    }
  }

  // 2. direct_answer 不执行检索工具。
  // 使用现有 decide 生成最终答案；此分支要求 decide 返回 done。
  if (directAnswerRoute) {
    let decision: AgentDecision;

    try {
      decision = await options.decide({
        question,
        steps: 0,
        evidence,
        lastTool,
        lastToolResult,
        routing,
      });
    } catch {
      return {
        status: "failed",
        evidence,
        trace,
        stopReason: "DECISION_FAILED",
        routing,
      };
    }

    if (!decision.done) {
      return {
        status: "failed",
        evidence,
        trace,
        stopReason: "DIRECT_ANSWER_NOT_FINAL",
        routing,
      };
    }

    if (!decision.answer?.trim()) {
      return {
        status: "failed",
        evidence,
        trace,
        stopReason: "EMPTY_FINAL_ANSWER",
        routing,
      };
    }

    return {
      status: "completed",
      answer: decision.answer,
      evidence,
      trace,
      stopReason: decision.reason,
      routing,
    };
  }

  // 3. 执行循环。
  // 第一轮使用初始路由；后续轮次恢复原有动态决策。
  for (let step = 1; step <= maxSteps; step++) {
    const observation: AgentObservation = {
      question,
      steps: step - 1,
      evidence,
      lastTool,
      lastToolResult,
      routing,
    };

    let decision: AgentDecision;

    if (step === 1 && initialAction) {
      decision = {
        action: initialAction,
        done: false,
        reason: "INITIAL_ROUTE",
      };
    } else {
      try {
        decision = await options.decide(observation);
      } catch {
        return {
          status: "failed",
          evidence,
          trace,
          stopReason: "DECISION_FAILED",
          routing,
        };
      }
    }

    if (decision.done) {
      if (!decision.answer?.trim()) {
        return {
          status: "failed",
          evidence,
          trace,
          stopReason: "EMPTY_FINAL_ANSWER",
          routing,
        };
      }

      return {
        status: "completed",
        answer: decision.answer,
        evidence,
        trace,
        stopReason: decision.reason,
        routing,
      };
    }

    if (!decision.action) {
      return {
        status: "failed",
        evidence,
        trace,
        stopReason: "MISSING_ACTION",
        routing,
      };
    }

    const action = decision.action;

    // 工具白名单校验仍然生效。
    const tool = options.tools[action.tool];

    if (!tool) {
      return {
        status: "failed",
        evidence,
        trace,
        stopReason: "TOOL_NOT_ALLOWED",
        routing,
      };
    }

    const startedAt = Date.now();

    try {
      const result = await tool.execute(action.input);
      const durationMs = Date.now() - startedAt;

      trace.push({
        step,
        action,
        success: result.ok,
        resultCount: result.metadata?.resultCount,
        errorCode: result.error?.code,
        durationMs,
      });

      lastTool = action.tool;
      lastToolResult = result;

      if (result.ok && result.data !== undefined) {
        evidence.push(result.data);
      }
    } catch {
      trace.push({
        step,
        action,
        success: false,
        errorCode: "TOOL_EXECUTION_FAILED",
        durationMs: Date.now() - startedAt,
      });

      lastTool = action.tool;
      lastToolResult = {
        ok: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
        },
      };
    }
  }

  return {
    status: "max_steps",
    evidence,
    trace,
    stopReason: "MAX_STEPS_REACHED",
    routing,
  };
}
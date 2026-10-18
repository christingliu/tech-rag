

export type AgentToolName =
  | "vector_search"
  | "keyword_search"
  | "graph_search";

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
  
    for (let step = 1; step <= maxSteps; step++) {
      const observation: AgentObservation = {
        question,
        steps: step - 1,
        evidence,
        lastTool,
        lastToolResult,
      };
  
      let decision: AgentDecision;
  
      try {
        decision = await options.decide(observation);
      } catch {
        return {
          status: "failed",
          evidence,
          trace,
          stopReason: "DECISION_FAILED",
        };
      }
  
      if (decision.done) {
        if (!decision.answer?.trim()) {
          return {
            status: "failed",
            evidence,
            trace,
            stopReason: "EMPTY_FINAL_ANSWER",
          };
        }
  
        return {
          status: "completed",
          answer: decision.answer,
          evidence,
          trace,
          stopReason: decision.reason,
        };
      }
  
      if (!decision.action) {
        return {
          status: "failed",
          evidence,
          trace,
          stopReason: "MISSING_ACTION",
        };
      }
  
      const action = decision.action;
  
      // 只允许调用显式注册的工具
      const tool = options.tools[action.tool];
  
      if (!tool) {
        return {
          status: "failed",
          evidence,
          trace,
          stopReason: "TOOL_NOT_ALLOWED",
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
    };
  }
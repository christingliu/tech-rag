import { randomUUID } from "node:crypto";

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
  messages: AgentMessage[];
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
  status: AgentStatus;
  answer?: string;
  evidence: unknown[];
  trace: AgentTrace[];
  stopReason: string;
  messages?: AgentMessage[];
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

export type AgentStatus =
  | "running"
  | "completed"
  | "failed"
  | "max_steps";

export type AgentMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
}


export interface AgentState {
  // 本次执行的身份和输入
  runId: string;
  question: string;

  // 控制状态
  status: AgentStatus;
  currentStep: number;
  maxSteps: number;

  // 多轮执行的共享数据
  evidence: unknown[];
  messages: AgentMessage[];
  trace: AgentTrace[];

  // 最近一次工具调用
  lastTool?: AgentToolName;
  lastToolResult?: unknown;

  // 终止状态
  answer?: string;
  stopReason?: string;
}

export type AgentStateUpdate = Partial<
  Pick<
    AgentState,
    | "status"
    | "currentStep"
    | "lastTool"
    | "lastToolResult"
    | "answer"
    | "stopReason"
  >
> & {
  evidenceToAppend?: unknown[];
  messagesToAppend?: AgentMessage[];
  traceToAppend?: AgentTrace[];
};

export interface AgentNodeInput {
  state: Readonly<AgentState>;
}

export interface AgentNodeOutput {
  update: AgentStateUpdate;
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
      messages: [],
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

  // 避免 unknown 值在序列化时导致消息记录中断。
  const serialize = (value: unknown): string => {
    try {
      const result = JSON.stringify(value);
      return result === undefined ? String(value) : result;
    } catch {
      return String(value);
    }
  };

  let state: AgentState = {
    runId: randomUUID(),
    question,
    status: "running",
    currentStep: 0,
    maxSteps,
    evidence: [],
    messages: [
      {
        role: "user",
        content: question,
      },
    ],
    trace: [],
  };

  // 统一从最新的共享状态构造返回结果。
  const toResult = (): AgentRunResult => ({
    status: state.status,
    answer: state.answer,
    evidence: state.evidence,
    trace: state.trace,
    messages: state.messages,
    stopReason: state.stopReason ?? "UNKNOWN",
  });

  for (let step = 1; step <= state.maxSteps; step++) {
    state = applyAgentStateUpdate(state, {
      currentStep: step - 1,
    });

    // 每轮决策使用同一份状态快照。
    const observation: AgentObservation = {
      question: state.question,
      steps: state.currentStep,
      evidence: [...state.evidence],
      messages: [...state.messages],
      lastTool: state.lastTool,
      lastToolResult: state.lastToolResult,
    };

    let decision: AgentDecision;

    try {
      decision = await options.decide(observation);
    } catch (error) {
      state = applyAgentStateUpdate(state, {
        status: "failed",
        stopReason: "DECISION_FAILED",
        messagesToAppend: [
          {
            role: "system",
            content: serialize({
              event: "decision_failed",
              step,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            }),
          },
        ],
      });

      return toResult();
    }

    // 记录本轮决策，包括理由、工具选择或最终答案。
    state = applyAgentStateUpdate(state, {
      messagesToAppend: [
        {
          role: "assistant",
          content: serialize({
            event: "decision",
            step,
            reason: decision.reason,
            done: decision.done,
            action: decision.action,
            answer: decision.answer,
          }),
        },
      ],
    });

    if (decision.done) {
      if (!decision.answer?.trim()) {
        state = applyAgentStateUpdate(state, {
          status: "failed",
          stopReason: "EMPTY_FINAL_ANSWER",
        });

        return toResult();
      }

      state = applyAgentStateUpdate(state, {
        status: "completed",
        answer: decision.answer,
        stopReason: decision.reason,
        messagesToAppend: [
          {
            role: "assistant",
            content: decision.answer,
          },
        ],
      });

      return toResult();
    }

    if (!decision.action) {
      state = applyAgentStateUpdate(state, {
        status: "failed",
        stopReason: "MISSING_ACTION",
      });

      return toResult();
    }

    const action = decision.action;
    const tool = options.tools[action.tool];

    if (!tool) {
      state = applyAgentStateUpdate(state, {
        status: "failed",
        stopReason: "TOOL_NOT_REGISTERED",
      });

      return toResult();
    }

    // 同一次工具调用的请求和结果使用同一个 ID。
    const toolCallId = randomUUID();

    state = applyAgentStateUpdate(state, {
      messagesToAppend: [
        {
          role: "assistant",
          toolName: action.tool,
          toolCallId,
          content: serialize({
            event: "tool_call",
            step,
            tool: action.tool,
            input: action.input,
            reason: action.reason,
          }),
        },
      ],
    });

    const startedAt = Date.now();

    try {
      const result = await tool.execute(action.input);
      const durationMs = Date.now() - startedAt;

      // 成功和业务失败都记录真实工具返回结果。
      state = applyAgentStateUpdate(state, {
        currentStep: step,
        lastTool: action.tool,
        lastToolResult: result,

        traceToAppend: [
          {
            step,
            action,
            success: result.ok,
            resultCount: result.metadata?.resultCount,
            errorCode: result.error?.code,
            durationMs,
          },
        ],

        evidenceToAppend:
          result.ok &&
          result.data !== undefined &&
          result.data !== null &&
          (!Array.isArray(result.data) ||
            result.data.length > 0)
            ? [result.data]
            : [],

        messagesToAppend: [
          {
            role: "tool",
            toolName: action.tool,
            toolCallId,
            content: serialize({
              ok: result.ok,
              data: result.data,
              metadata: result.metadata,
              error: result.error,
            }),
          },
        ],
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      const failedResult = {
        ok: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
      };

      state = applyAgentStateUpdate(state, {
        currentStep: step,
        lastTool: action.tool,
        lastToolResult: failedResult,

        traceToAppend: [
          {
            step,
            action,
            success: false,
            errorCode: "TOOL_EXECUTION_FAILED",
            durationMs,
          },
        ],

        messagesToAppend: [
          {
            role: "tool",
            toolName: action.tool,
            toolCallId,
            content: serialize(failedResult),
          },
        ],
      });
    }
  }

  state = applyAgentStateUpdate(state, {
    status: "max_steps",
    currentStep: state.maxSteps,
    stopReason: "MAX_STEPS_REACHED",
  });

  return toResult();
}

export function applyAgentStateUpdate(
  state: AgentState,
  update: AgentStateUpdate,
): AgentState {
  const {
    evidenceToAppend = [],
    messagesToAppend = [],
    traceToAppend = [],
    ...fields
  } = update;

  return {
    ...state,
    ...fields,
    evidence: [...state.evidence, ...evidenceToAppend],
    messages: [...state.messages, ...messagesToAppend],
    trace: [...state.trace, ...traceToAppend],
  };
}
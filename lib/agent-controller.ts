import { randomUUID } from "node:crypto";

export type AgentToolName =
  | "vector_search"
  | "keyword_search"
  | "graph_search"
  | "entity_lookup";

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

export interface DecisionNodeOutput extends AgentNodeOutput {
  decision: AgentDecision;
}

export interface ToolExecutionNodeInput extends AgentNodeInput {
  action: AgentAction;
  toolCallId: string;
}

export interface AgentNode<
  TInput extends AgentNodeInput,
  TOutput extends AgentNodeOutput,
> {
  execute(input: TInput): Promise<TOutput>;
}

export interface AgentControllerOptions {
  maxSteps?: number;
  tools: Partial<Record<AgentToolName, AgentTool>>;
  decide: (
    observation: AgentObservation,
  ) => Promise<AgentDecision>;
}

export type AgentRoute =
  | {
      type: "execute_tool";
      action: AgentAction;
    }
  | {
      type: "finalize";
      status: "completed" | "failed";
      stopReason: string;
      answer?: string;
    };


    export function createDecisionNode(
      decide: AgentControllerOptions["decide"],
    ): AgentNode<AgentNodeInput, DecisionNodeOutput> {
      return {
        async execute({ state }) {
          const observation: AgentObservation = {
            question: state.question,
            steps: state.currentStep,
            evidence: [...state.evidence],
            messages: [...state.messages],
            lastTool: state.lastTool,
            lastToolResult: state.lastToolResult,
          };
    
          const decision = await decide(observation);
    
          return {
            decision,
            update: {
              messagesToAppend: [
                {
                  role: "assistant",
                  content: JSON.stringify({
                    event: "decision",
                    step: state.currentStep + 1,
                    reason: decision.reason,
                    done: decision.done,
                    action: decision.action,
                    answer: decision.answer,
                  }),
                },
              ],
            },
          };
        },
      };
    }
    
    export function createToolExecutionNode(
      tools: AgentControllerOptions["tools"],
    ): AgentNode<ToolExecutionNodeInput, AgentNodeOutput> {
      return {
        async execute({ state, action, toolCallId }) {
          const tool = tools[action.tool];
    
          if (!tool) {
            throw new Error(`TOOL_NOT_REGISTERED: ${action.tool}`);
          }
    
          const startedAt = Date.now();
    
          const callMessage: AgentMessage = {
            role: "assistant",
            toolName: action.tool,
            toolCallId,
            content: JSON.stringify({
              event: "tool_call",
              step: state.currentStep + 1,
              tool: action.tool,
              input: action.input,
              reason: action.reason,
            }),
          };
    
          try {
            const result = await tool.execute(action.input);
            const durationMs = Date.now() - startedAt;
    
            return {
              update: {
                currentStep: state.currentStep + 1,
                lastTool: action.tool,
                lastToolResult: result,
    
                traceToAppend: [
                  {
                    step: state.currentStep + 1,
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
                  callMessage,
                  {
                    role: "tool",
                    toolName: action.tool,
                    toolCallId,
                    content: JSON.stringify({
                      ok: result.ok,
                      data: result.data,
                      metadata: result.metadata,
                      error: result.error,
                    }),
                  },
                ],
              },
            };
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
    
            return {
              update: {
                currentStep: state.currentStep + 1,
                lastTool: action.tool,
                lastToolResult: failedResult,
    
                traceToAppend: [
                  {
                    step: state.currentStep + 1,
                    action,
                    success: false,
                    errorCode: "TOOL_EXECUTION_FAILED",
                    durationMs,
                  },
                ],
    
                messagesToAppend: [
                  callMessage,
                  {
                    role: "tool",
                    toolName: action.tool,
                    toolCallId,
                    content: JSON.stringify(failedResult),
                  },
                ],
              },
            };
          }
        },
      };
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

  let state: AgentState = {
    runId: randomUUID(),
    question,
    status: "running",
    currentStep: 0,
    maxSteps,
    evidence: [],
    messages: [{ role: "user", content: question }],
    trace: [],
  };

  const decisionNode = createDecisionNode(options.decide);
  const toolExecutionNode = createToolExecutionNode(options.tools);

  const toResult = (): AgentRunResult => ({
    status: state.status,
    answer: state.answer,
    evidence: state.evidence,
    trace: state.trace,
    messages: state.messages,
    stopReason: state.stopReason ?? "UNKNOWN",
  });

  for (let step = 1; step <= state.maxSteps; step++) {
    let decisionOutput: DecisionNodeOutput;

    try {
      decisionOutput = await decisionNode.execute({ state });
    } catch (error) {
      state = finalizeAgentState(
        state,
        "failed",
        "DECISION_FAILED",
      );
      
      state = applyAgentStateUpdate(state, {
        messagesToAppend: [
          {
            role: "system",
            content: JSON.stringify({
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

    // 先应用决策节点更新，保证后续节点看到最新消息历史。
    state = applyAgentStateUpdate(
      state,
      decisionOutput.update,
    );

    const decision = decisionOutput.decision;
    const route = routeDecision(state, decision, options.tools);
    
    if (route.type === "finalize") {
      state = finalizeAgentState(
        state,
        route.status,
        route.stopReason,
        route.answer,
      );
    
      return toResult();
    }
    
    // 只有 execute_tool 路由会执行到这里。
    const toolCallId = randomUUID();
    
    try {
      const toolOutput = await toolExecutionNode.execute({
        state,
        action: route.action,
        toolCallId,
      });
    
      state = applyAgentStateUpdate(state, toolOutput.update);
    } catch (error) {
      state = applyAgentStateUpdate(state, {
        status: "failed",
        stopReason: "TOOL_NODE_FAILED",
        messagesToAppend: [
          {
            role: "system",
            content: JSON.stringify({
              event: "tool_node_failed",
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
  }

  // 所有步数用完仍未得到最终答案
  state = finalizeAgentState(
    state,
    "max_steps",
    "MAX_STEPS_REACHED",
  );

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

export function routeDecision(
  state: Readonly<AgentState>,
  decision: AgentDecision,
  tools: AgentControllerOptions["tools"],
): AgentRoute {
  if (decision.done) {
    const hasEvidence = state.evidence.some((item) => {
      if (item === null || item === undefined) {
        return false;
      }

      return !Array.isArray(item) || item.length > 0;
    });

    if (!hasEvidence) {
      return {
        type: "finalize",
        status: "failed",
        stopReason: "NO_EVIDENCE_FOUND",
      };
    }

    if (!decision.answer?.trim()) {
      return {
        type: "finalize",
        status: "failed",
        stopReason: "EMPTY_FINAL_ANSWER",
      };
    }

    return {
      type: "finalize",
      status: "completed",
      stopReason: "LLM_FINAL_ANSWER",
      answer: decision.answer,
    };
  }

  if (!decision.action) {
    return {
      type: "finalize",
      status: "failed",
      stopReason: "MISSING_ACTION",
    };
  }

  if (!tools[decision.action.tool]) {
    return {
      type: "finalize",
      status: "failed",
      stopReason: "TOOL_NOT_REGISTERED",
    };
  }

  return {
    type: "execute_tool",
    action: decision.action,
  };
}

export function finalizeAgentState(
  state: AgentState,
  status: "completed" | "failed" | "max_steps",
  stopReason: string,
  answer?: string,
): AgentState {
  return applyAgentStateUpdate(state, {
    status,
    stopReason,
    answer,
    ...(status === "completed" && answer
      ? {
          messagesToAppend: [
            {
              role: "assistant" as const,
              content: answer,
            },
          ],
        }
      : {}),
  });
}
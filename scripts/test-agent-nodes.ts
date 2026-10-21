import assert from "node:assert/strict";

import {
  applyAgentStateUpdate,
  createDecisionNode,
  createToolExecutionNode,
  type AgentState,
} from "../lib/agent-controller";

async function main() {
  const state: AgentState = {
    runId: "test-run",
    question: "测试节点契约",
    status: "running",
    currentStep: 0,
    maxSteps: 2,
    evidence: [],
    messages: [
      { role: "user", content: "测试节点契约" },
    ],
    trace: [],
  };

  // 1. 决策节点只返回决策和更新，不直接修改状态。
  const decisionNode = createDecisionNode(async (observation) => {
    assert.equal(observation.question, state.question);
    assert.equal(observation.steps, 0);

    return {
      done: false,
      reason: "执行向量检索",
      action: {
        tool: "vector_search",
        input: { query: "测试" },
        reason: "测试节点输出",
      },
    };
  });

  const decisionOutput = await decisionNode.execute({ state });

  assert.equal(decisionOutput.decision.done, false);
  assert.equal(state.messages.length, 1);
  assert.equal(state.currentStep, 0);

  const stateAfterDecision = applyAgentStateUpdate(
    state,
    decisionOutput.update,
  );

  assert.equal(stateAfterDecision.messages.length, 2);
  assert.equal(state.messages.length, 1);

  // 2. 工具节点同样只返回更新。
  const toolNode = createToolExecutionNode({
    vector_search: {
      async execute() {
        return {
          ok: true,
          data: [{ id: "doc-1", content: "测试证据" }],
          metadata: { resultCount: 1 },
        };
      },
    },
  });

  const toolOutput = await toolNode.execute({
    state: stateAfterDecision,
    action: decisionOutput.decision.action!,
    toolCallId: "test-call-1",
  });

  assert.equal(stateAfterDecision.currentStep, 0);
  assert.equal(stateAfterDecision.evidence.length, 0);

  const finalState = applyAgentStateUpdate(
    stateAfterDecision,
    toolOutput.update,
  );

  assert.equal(finalState.currentStep, 1);
  assert.equal(finalState.evidence.length, 1);
  assert.equal(finalState.trace.length, 1);
  assert.equal(finalState.trace[0].success, true);

  const toolMessage = finalState.messages.find(
    (message) =>
      message.role === "tool" &&
      message.toolCallId === "test-call-1",
  );

  assert.ok(toolMessage);

  assert.ok(
    finalState.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.toolCallId === "test-call-1",
    ),
  );

  console.log("V9.5.4 Agent 节点契约测试通过");
  console.log("Decision output: immutable update");
  console.log("Tool output: evidence + trace + messages");
  console.log("Shared state: consistent");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
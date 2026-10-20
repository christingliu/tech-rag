import assert from "node:assert/strict";

import {
  applyAgentStateUpdate,
  type AgentState,
} from "../lib/agent-controller";

const initialState: AgentState = {
  runId: "test-run-001",
  question: "测试 Agent 状态更新",
  status: "running",
  currentStep: 0,
  maxSteps: 3,
  evidence: [{ source: "vector_search" }],
  messages: [
    { role: "user", content: "测试 Agent 状态更新" },
  ],
  trace: [],
};

const nextState = applyAgentStateUpdate(initialState, {
  currentStep: 1,
  lastTool: "keyword_search",
  evidenceToAppend: [{ source: "keyword_search" }],
  messagesToAppend: [
    {
      role: "assistant",
      content: "切换到关键词检索",
    },
  ],
  traceToAppend: [
    {
      step: 1,
      action: {
        tool: "keyword_search",
        input: { query: "测试 Agent 状态更新" },
        reason: "验证状态更新",
      },
      success: true,
      resultCount: 1,
      durationMs: 5,
    },
  ],
});

assert.equal(initialState.currentStep, 0);
assert.equal(nextState.currentStep, 1);

assert.equal(initialState.evidence.length, 1);
assert.equal(nextState.evidence.length, 2);

assert.equal(initialState.messages.length, 1);
assert.equal(nextState.messages.length, 2);

assert.equal(initialState.trace.length, 0);
assert.equal(nextState.trace.length, 1);

assert.equal(nextState.lastTool, "keyword_search");
assert.equal(nextState.status, "running");

console.log("V9.5.2 状态更新测试通过");
console.log("Original evidence:", initialState.evidence.length);
console.log("Updated evidence:", nextState.evidence.length);
console.log("Updated messages:", nextState.messages.length);
console.log("Updated trace:", nextState.trace.length);
console.log("Current step:", nextState.currentStep);
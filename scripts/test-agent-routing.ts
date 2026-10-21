import assert from "node:assert/strict";

import {
  finalizeAgentState,
  routeDecision,
  type AgentState,
} from "../lib/agent-controller";

const state: AgentState = {
  runId: "routing-test",
  question: "测试条件路由",
  status: "running",
  currentStep: 0,
  maxSteps: 3,
  evidence: [
    { id: "doc-1", content: "有效证据" },
  ],
  messages: [
    { role: "user", content: "测试条件路由" },
  ],
  trace: [],
};

const tools = {
  vector_search: {
    async execute() {
      return {
        ok: true,
        data: [{ id: "doc-1" }],
        metadata: { resultCount: 1 },
      };
    },
  },
};

async function main() {
  // 1. 有证据且有答案：正常结束。
  const completedRoute = routeDecision(
    state,
    {
      done: true,
      answer: "测试答案",
      reason: "证据充分",
    },
    tools,
  );

  assert.deepEqual(completedRoute, {
    type: "finalize",
    status: "completed",
    stopReason: "LLM_FINAL_ANSWER",
    answer: "测试答案",
  });

  // 2. 无证据：失败结束。
  const emptyEvidenceRoute = routeDecision(
    { ...state, evidence: [] },
    {
      done: true,
      answer: "没有依据的答案",
      reason: "模拟无证据场景",
    },
    tools,
  );

  assert.equal(emptyEvidenceRoute.type, "finalize");

  if (emptyEvidenceRoute.type === "finalize") {
    assert.equal(emptyEvidenceRoute.status, "failed");
    assert.equal(
      emptyEvidenceRoute.stopReason,
      "NO_EVIDENCE_FOUND",
    );
  }

  // 3. 没有 action：失败结束。
  const missingActionRoute = routeDecision(
    state,
    {
      done: false,
      reason: "模拟缺少 action",
    },
    tools,
  );

  assert.equal(missingActionRoute.type, "finalize");

  if (missingActionRoute.type === "finalize") {
    assert.equal(
      missingActionRoute.stopReason,
      "MISSING_ACTION",
    );
  }

  // 4. 工具未注册：失败结束。
  const missingToolRoute = routeDecision(
    state,
    {
      done: false,
      reason: "模拟未注册工具",
      action: {
        tool: "graph_search",
        input: {},
        reason: "测试",
      },
    },
    tools,
  );

  assert.equal(missingToolRoute.type, "finalize");

  if (missingToolRoute.type === "finalize") {
    assert.equal(
      missingToolRoute.stopReason,
      "TOOL_NOT_REGISTERED",
    );
  }

  // 5. 正常工具调用：进入工具节点。
  const toolRoute = routeDecision(
    state,
    {
      done: false,
      reason: "执行检索",
      action: {
        tool: "vector_search",
        input: { query: "test" },
        reason: "获取证据",
      },
    },
    tools,
  );

  assert.equal(toolRoute.type, "execute_tool");

  if (toolRoute.type === "execute_tool") {
    assert.equal(toolRoute.action.tool, "vector_search");
  }

  // 6. 统一终态更新不修改原状态。
  const completedState = finalizeAgentState(
    state,
    "completed",
    "LLM_FINAL_ANSWER",
    "测试答案",
  );

  assert.equal(completedState.status, "completed");
  assert.equal(completedState.answer, "测试答案");
  assert.equal(
    completedState.stopReason,
    "LLM_FINAL_ANSWER",
  );

  assert.equal(state.status, "running");
  assert.equal(state.answer, undefined);
  assert.equal(state.messages.length, 1);

  // 7. 最大步数终态。
  const maxStepsState = finalizeAgentState(
    state,
    "max_steps",
    "MAX_STEPS_REACHED",
  );

  assert.equal(maxStepsState.status, "max_steps");
  assert.equal(
    maxStepsState.stopReason,
    "MAX_STEPS_REACHED",
  );

  console.log("V9.5.5 条件路由与终态测试通过");
  console.log("Completed route: passed");
  console.log("No-evidence route: passed");
  console.log("Missing-action route: passed");
  console.log("Unregistered-tool route: passed");
  console.log("Tool-execution route: passed");
  console.log("Immutable finalization: passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
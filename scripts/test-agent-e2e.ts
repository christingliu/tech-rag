
import "./env";

import assert from "node:assert/strict";

import {
  runAgent,
  type AgentTool,
  type AgentToolName,
} from "../lib/agent-controller";

import {
  buildAgentLlmContext,
} from "../lib/agent-llm-decider";

import {
  parseLlmAnswer,
  resolveAgentAnswer,
} from "../lib/agent-answer";

import {
  fromVectorChunk,
  type UnifiedEvidence,
} from "../lib/unified-evidence";

import type {
  HybridRetrievalResult,
} from "../lib/hybrid-retriever";

import type {
  AgentLlmContext,
} from "../lib/agent-llm-decider";

// ======================================================
// 1. 测试数据
// ======================================================

const QUESTION =
  "React 中 useState 和 useEffect 分别解决什么问题？";

const ANSWER =
  "useState 用于管理 React 组件状态；" +
  "useEffect 用于在组件渲染后同步外部系统。";

const contextOptions = {
  contextWindow: 400_000,
  reservedOutputTokens: 4_096,
  safetyMargin: 0.15,
};

// 使用真实 UnifiedEvidence 转换函数构造测试数据。
// 不直接手写 Evidence ID，避免测试绕过 ID 生成逻辑。

const useStateBase = fromVectorChunk({
  source: "react/hooks.md",
  title: "React Hooks",
  section: "useState",
  chunkIndex: 1,
  content:
    "useState 是 React Hook，用于在函数组件中添加和管理状态。",
  score: 0.95,
});

const useStateEvidence: UnifiedEvidence = {
  ...useStateBase,
  sources: ["vector", "graph"],
  graphRelations: [
    {
      edgeId: "edge-react-usestate",
      sourceEntityId: "react",
      sourceEntityName: "React",
      targetEntityId: "use-state",
      targetEntityName: "useState",
      relation: "provides_hook",
      graphEvidenceId: "graph-evidence-usestate",
    },
  ],
};

const useEffectEvidence = fromVectorChunk({
  source: "react/hooks.md",
  title: "React Hooks",
  section: "useEffect",
  chunkIndex: 2,
  content:
    "useEffect 用于在组件渲染后同步外部系统，" +
    "例如订阅、定时器或网络请求。",
  score: 0.93,
});

// 模拟 Hybrid Retriever 的真实返回结构。
// 这里不调用 Qdrant 和真实 Graph，保证测试结果可重复。

const hybridResult: HybridRetrievalResult = {
  query: QUESTION,
  status: "success",

  evidence: [
    useStateEvidence,
    useEffectEvidence,
  ],

  vector: {
    status: "success",
    resultCount: 2,
  },

  graph: {
    status: "success",
    resultCount: 1,
    unresolvedCount: 0,
  },
};

// ======================================================
// 2. E2E：完整问答链路
// ======================================================

async function testFullAgentE2E() {
  console.log("\n========== V9.8.6.1 完整问答链路 ==========");

  let decisionRound = 0;
  let toolCallCount = 0;

  let finalContext: AgentLlmContext | undefined;

  // Mock Hybrid Retrieval Tool。
  const tools: Partial<
    Record<AgentToolName, AgentTool>
  > = {
    graph_vector_search: {
      async execute(input) {
        toolCallCount++;

        assert.equal(
          input.query,
          QUESTION,
          "检索 Query 不正确",
        );

        return {
          ok: true,
          data: hybridResult,
          metadata: {
            resultCount: hybridResult.evidence.length,
          },
        };
      },
    },
  };

  const result = await runAgent(QUESTION, {
    maxSteps: 3,
    tools,

    // Mock Agent Decision + Mock LLM。
    decide: async (observation) => {
      decisionRound++;

      // 第一轮：Agent 选择 Hybrid Retrieval。
      if (decisionRound === 1) {
        assert.equal(observation.steps, 0);

        return {
          done: false,
          action: {
            tool: "graph_vector_search",
            input: {
              query: QUESTION,
              vectorTopK: 5,
              maxHops: 1,
            },
            reason: "问题需要语义证据和图谱关系证据",
          },
          reason: "MOCK_SELECT_HYBRID_SEARCH",
        };
      }

      // 第二轮：检索结果已经进入 Agent Observation。
      assert.equal(observation.steps, 1);

      assert.equal(
        observation.evidence.length,
        1,
        "Hybrid Retrieval 结果没有进入 Agent State",
      );

      // 真实 Context Builder。
      finalContext = buildAgentLlmContext(
        observation,
        contextOptions,
      );

      const includedEvidence =
        finalContext.hybridContext.includedEvidence;

      // Context 必须包含两条测试 Evidence。
      assert.equal(
        includedEvidence.length,
        2,
        "Evidence 没有全部进入 Context",
      );

      assert.equal(
        finalContext.hybridContext.omittedEvidence.length,
        0,
      );

      // 检查 LLM 实际接收的 Context。
      assert.ok(
        finalContext.userContent.includes(
          "useState 是 React Hook",
        ),
      );

      assert.ok(
        finalContext.userContent.includes(
          "useEffect 用于在组件渲染后",
        ),
      );

      assert.ok(
        finalContext.userContent.includes(
          "edge-react-usestate",
        ),
        "Graph 关系没有进入 LLM Context",
      );

      // Mock LLM 返回结构化 JSON。
      // 引用 ID 从真正进入 Context 的 Evidence 获取。
      const mockLlmRawAnswer = JSON.stringify({
        answer: ANSWER,
        citations: includedEvidence.map(
          (item) => item.id,
        ),
      });

      // 使用真实答案解析函数。
      const payload = parseLlmAnswer(
        mockLlmRawAnswer,
      );

      // 使用真实引用验证函数。
      const resolvedAnswer = resolveAgentAnswer(
        payload,
        includedEvidence,
      );

      return {
        done: true,
        answer: resolvedAnswer.answer,
        citations: resolvedAnswer.citations,
        reason: "LLM_FINAL_ANSWER",
      };
    },
  });

  // ----------------------------------------------------
  // 验证 Controller 最终结果
  // ----------------------------------------------------

  assert.equal(result.status, "completed");

  assert.equal(
    result.stopReason,
    "LLM_FINAL_ANSWER",
  );

  assert.equal(result.answer, ANSWER);

  assert.equal(toolCallCount, 1);

  assert.equal(decisionRound, 2);

  // ----------------------------------------------------
  // 验证检索结果进入 Agent State
  // ----------------------------------------------------

  assert.equal(result.evidence.length, 1);

  const storedHybrid =
    result.evidence[0] as HybridRetrievalResult;

  assert.equal(storedHybrid.status, "success");

  assert.equal(storedHybrid.evidence.length, 2);

  // ----------------------------------------------------
  // 验证 Context
  // ----------------------------------------------------

  assert.ok(finalContext);

  assert.equal(
    finalContext.hybridContext.includedEvidence.length,
    2,
  );

  assert.deepEqual(
    finalContext.hybridContext.includedIds,
    storedHybrid.evidence.map((item) => item.id),
  );

  // ----------------------------------------------------
  // 验证 Citation 从 Decision 到 RunResult
  // ----------------------------------------------------

  const expectedCitationIds =
    finalContext.hybridContext.includedEvidence.map(
      (item) => item.id,
    );

  assert.deepEqual(
    result.citations?.map(
      (item) => item.evidenceId,
    ),
    expectedCitationIds,
  );

  assert.deepEqual(
    result.citations?.map(
      (item) => item.source,
    ),
    [
      "react/hooks.md",
      "react/hooks.md",
    ],
  );

  assert.deepEqual(
    result.citations?.map(
      (item) => item.section,
    ),
    ["useState", "useEffect"],
  );

  // ----------------------------------------------------
  // 验证 Execution Trace
  // ----------------------------------------------------

  assert.equal(result.trace.length, 1);

  assert.equal(
    result.trace[0].action.tool,
    "graph_vector_search",
  );

  assert.equal(result.trace[0].success, true);

  assert.equal(
    result.trace[0].resultCount,
    2,
  );

  // ----------------------------------------------------
  // 验证 Message History
  // ----------------------------------------------------

  assert.ok(
    result.messages?.some(
      (message) =>
        message.role === "assistant" &&
        message.content.includes('"citations"'),
    ),
    "Decision 中没有记录 citations",
  );

  assert.ok(
    result.messages?.some(
      (message) =>
        message.role === "assistant" &&
        message.content === ANSWER,
    ),
    "最终答案没有进入 Message History",
  );

  console.log("PASS: Agent 选择 Hybrid Retrieval");
  console.log("PASS: Hybrid Evidence 进入 Agent State");
  console.log("PASS: Evidence 进入 Hybrid Context");
  console.log("PASS: Graph 关系进入 Context");
  console.log("PASS: Mock LLM 返回结构化答案");
  console.log("PASS: Citation ID 验证");
  console.log("PASS: Citation Metadata 映射");
  console.log("PASS: Citation 传递到 AgentRunResult");
  console.log("PASS: Execution Trace");
  console.log("PASS: Message History");

  console.log("\n最终结果：", {
    status: result.status,
    stopReason: result.stopReason,
    toolCalls: toolCallCount,
    evidenceCount: storedHybrid.evidence.length,
    includedEvidence:
      finalContext.hybridContext.includedIds.length,
    citationCount: result.citations?.length,
    traceCount: result.trace.length,
  });
}

// ======================================================
// 3. 无 Evidence 时不能生成成功答案
// ======================================================

async function testNoEvidenceE2E() {
  console.log("\n========== V9.8.6.2 无 Evidence 验证 ==========");

  let decisionRound = 0;

  const emptyTools: Partial<
    Record<AgentToolName, AgentTool>
  > = {
    graph_vector_search: {
      async execute() {
        return {
          ok: true,
          data: [],
          metadata: {
            resultCount: 0,
          },
        };
      },
    },
  };

  const result = await runAgent(
    "React 中某个不存在的 API 是什么？",
    {
      maxSteps: 3,
      tools: emptyTools,

      decide: async () => {
        decisionRound++;

        if (decisionRound === 1) {
          return {
            done: false,
            action: {
              tool: "graph_vector_search",
              input: {
                query: "不存在的 API",
                vectorTopK: 5,
                maxHops: 1,
              },
              reason: "尝试检索",
            },
            reason: "MOCK_SEARCH",
          };
        }

        return {
          done: true,
          answer: "知识库没有找到足够证据。",
          citations: [],
          reason: "LLM_FINAL_ANSWER",
        };
      },
    },
  );

  assert.equal(result.status, "failed");

  assert.equal(
    result.stopReason,
    "NO_EVIDENCE_FOUND",
  );

  assert.equal(result.answer, undefined);

  assert.equal(result.evidence.length, 0);

  assert.equal(result.citations, undefined);

  assert.equal(result.trace.length, 1);

  assert.equal(result.trace[0].success, true);

  assert.equal(result.trace[0].resultCount, 0);

  console.log("PASS: 空检索结果没有进入 Evidence");
  console.log("PASS: Controller 拒绝无 Evidence 的最终答案");
  console.log("PASS: 无 Evidence 时不返回伪造 Citation");
}

// ======================================================
// 4. Token Budget 筛掉的 Evidence 不允许引用
// ======================================================

async function testOmittedEvidenceCannotBeCited() {
  console.log("\n========== V9.8.6.3 Citation 边界验证 ==========");

  const context = buildAgentLlmContext(
    {
      question: QUESTION,
      steps: 1,
      messages: [],
      evidence: [hybridResult],
      lastTool: "graph_vector_search",
      lastToolResult: {
        ok: true,
        data: hybridResult,
        metadata: {
          resultCount: hybridResult.evidence.length,
        },
      },
    },
    {
      // 故意设置极小预算，确保没有 Evidence 能进入 Context。
      contextWindow: 1,
      reservedOutputTokens: 0,
      safetyMargin: 0,
    },
  );

  assert.equal(
    context.hybridContext.includedEvidence.length,
    0,
  );

  assert.equal(
    context.hybridContext.omittedEvidence.length,
    2,
  );

  const omittedId =
    context.hybridContext.omittedEvidence[0].id;

  // 即使 Evidence 已经检索到，
  // 只要没有进入本轮 Context，就不能引用。
  assert.throws(
    () =>
      resolveAgentAnswer(
        {
          answer: "测试答案",
          citations: [omittedId],
        },
        context.hybridContext.includedEvidence,
      ),
    /UNKNOWN_EVIDENCE_CITATION/,
  );

  console.log("PASS: Token Budget 筛除 Evidence");
  console.log("PASS: 被筛除的 Evidence 无法被引用");
}

// ======================================================
// 5. 执行所有测试
// ======================================================

async function main() {
  await testFullAgentE2E();

  await testNoEvidenceE2E();

  await testOmittedEvidenceCannotBeCited();

  console.log("\n====================================");
  console.log("V9.8.6 Agentic RAG E2E 验证全部通过");
  console.log("====================================");
}

main().catch((error) => {
  console.error("\nV9.8.6 E2E 验证失败：", error);
  process.exitCode = 1;
});

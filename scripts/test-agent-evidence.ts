import './env';
import assert from "node:assert/strict";

import {
  normalizeAgentEvidence,
} from "../lib/agent-evidence";

import {
  buildAgentLlmContext,
} from "../lib/agent-llm-decider";

import {
  fromVectorChunk,
} from "../lib/unified-evidence";

const metadata = {
  source: "react/hooks.md",
  title: "React Hooks",
  section: "useState",
  chunkIndex: 1,
};

const vectorChunk = {
  ...metadata,
  content: "useState 用于管理组件状态",
  score: 0.92,
};

const keywordChunk = {
  ...metadata,
  content: "useState 用于管理组件状态",
  keywordScore: 0.8,
};

// 1. Vector + Keyword 合并
{
  const result = normalizeAgentEvidence([
    [vectorChunk],
    [keywordChunk],
  ]);
  console.log(result,'result');
  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].sources.sort(),
    ["keyword", "vector"],
  );
  assert.equal(result[0].scores.vector, 0.92);
  assert.equal(result[0].scores.keyword, 0.8);

  console.log("PASS: Vector + Keyword 合并");
}

// 2. Graph 原始结果转换
{
  const graphResult = {
    matchedNodes: [
      { id: "use-state", name: "useState" },
    ],
    expandedNodes: [
      { id: "react", name: "React" },
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "use-state",
        targetId: "react",
        relation: "belongs_to",
        evidenceIds: ["graph-evidence-1"],
      },
    ],
    evidence: [
      {
        id: "graph-evidence-1",
        ...metadata,
      },
    ],
    chunks: [
      {
        ...metadata,
        content: "useState 是 React 提供的 Hook",
        score: 0.9,
      },
    ],
  };

  const result = normalizeAgentEvidence([
    graphResult,
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].sources[0], "graph");
  assert.equal(result[0].graphRelations.length, 1);
  assert.equal(
    result[0].graphRelations[0].relation,
    "belongs_to",
  );

  console.log("PASS: Graph Result 转换与关系保留");
}

// 3. Hybrid Retrieval 结果直接复用
{
  const hybridEvidence = fromVectorChunk({
    ...vectorChunk,
  });

  const hybridResult = {
    status: "success",
    query: "useState",
    evidence: [hybridEvidence],
    vector: {
      status: "success",
      resultCount: 1,
    },
    graph: {
      status: "success",
      resultCount: 1,
      unresolvedCount: 0,
    },
  };

  const result = normalizeAgentEvidence([
    hybridResult,
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, hybridEvidence.id);

  console.log("PASS: Hybrid Evidence 直接复用");
}

// 4. 多轮工具结果统一去重
{
  const result = normalizeAgentEvidence([
    [vectorChunk],
    [keywordChunk],
    {
      status: "success",
      query: "useState",
      evidence: [
        fromVectorChunk(vectorChunk),
      ],
      vector: {
        status: "success",
        resultCount: 1,
      },
      graph: {
        status: "success",
        resultCount: 0,
        unresolvedCount: 0,
      },
    },
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].sources.sort(),
    ["keyword", "vector"],
  );

  console.log("PASS: 多轮检索结果去重");
}

// 5. Entity Lookup 不进入 Evidence
{
  const result = normalizeAgentEvidence([
    {
      status: "resolved",
      entity: "React",
      candidates: [],
    },
  ]);

  console.log(result,'result');
  assert.equal(result.length, 0);

  console.log("PASS: Entity Lookup 不进入 Evidence");
}

// 6. 未知结构不能静默丢弃
{
  assert.throws(
    () => normalizeAgentEvidence([
      { unexpected: true },
    ]),
    /UNSUPPORTED_AGENT_EVIDENCE/,
  );

  console.log("PASS: 未知结构校验");
}

console.log("V9.8.5.1 Agent Evidence 测试全部通过");


// 7. Agent LLM Context 集成
{
  const evidence = fromVectorChunk({
    source: "react/hooks.md",
    title: "React Hooks",
    section: "useState",
    chunkIndex: 1,
    content: "useState 用于管理组件状态",
    score: 0.92,
  });

  const result = buildAgentLlmContext({
    question: "React 中 useState 的作用是什么？",
    steps: 1,
    messages: [],
    evidence: [[evidence]],
    lastTool: "vector_search",
    lastToolResult: {
      ok: true,
      data: [evidence],
      metadata: {
        resultCount: 1,
      },
    },
  });

  assert.ok(result.userContent.includes(evidence.id));
  assert.ok(
    result.userContent.includes("useState 用于管理组件状态"),
  );

  assert.equal(
    result.hybridContext.includedIds.length,
    1,
  );

  assert.equal(
    result.hybridContext.omittedIds.length,
    0,
  );

  console.log("PASS: Agent LLM 使用 Hybrid Context");
}

// 8. 空 Evidence 仍然可以构建决策上下文
{
  const result = buildAgentLlmContext({
    question: "React 是什么？",
    steps: 0,
    messages: [],
    evidence: [],
  });

  assert.ok(
    result.userContent.includes("当前没有可用的检索证据"),
  );

  assert.equal(
    result.hybridContext.includedIds.length,
    0,
  );

  console.log("PASS: 空 Evidence Context 处理");
}


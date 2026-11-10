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

import {
  parseLlmAnswer,
  resolveAgentAnswer,
} from "../lib/agent-answer";


/* const metadata = {
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
 */
// 使用你现有测试文件中真实的 UnifiedEvidence fixture
{const evidence = {
  id: "evidence-test-001",
  content: "useState 用于管理 React 组件状态。",
  sources: ["vector"],
  scores: { vector: 0.9 },
  metadata: {
    source: "react/hooks.md",
    title: "React Hooks",
    section: "useState",
    chunkIndex: 1,
  },
  graphRelations: [],
};

const includedEvidence = [evidence];

/** 1. 正常解析 */
const payload = parseLlmAnswer(
  JSON.stringify({
    answer: "useState 用于管理组件状态。",
    citations: ["evidence-test-001"],
  }),
);

assert.equal(
  payload.answer,
  "useState 用于管理组件状态。",
);

console.log("PASS: LLM 答案解析");

/** 2. 正常引用映射 */
const resolved = resolveAgentAnswer(
  payload,
  includedEvidence as [],
);

assert.equal(resolved.citations.length, 1);
assert.equal(
  resolved.citations[0].source,
  "react/hooks.md",
);
assert.equal(
  resolved.citations[0].chunkIndex,
  1,
);

console.log("PASS: Evidence ID 映射原始来源");

/** 3. 伪造引用必须拒绝 */
assert.throws(
  () =>
    resolveAgentAnswer(
      {
        answer: "测试答案",
        citations: ["evidence-fake"],
      },
      includedEvidence as [],
    ),
  /UNKNOWN_EVIDENCE_CITATION/,
);

console.log("PASS: 未知 Evidence ID 拒绝");

/** 4. 已检索但未进入 Context 的 Evidence 必须拒绝 */
assert.throws(
  () =>
    resolveAgentAnswer(
      {
        answer: "测试答案",
        citations: ["evidence-omitted"],
      },
      includedEvidence as [],
    ),
  /UNKNOWN_EVIDENCE_CITATION/,
);

console.log("PASS: 未进入 Context 的 Evidence 拒绝");

/** 5. 重复引用去重 */
const deduplicated = resolveAgentAnswer(
  {
    answer: "测试答案",
    citations: [
      "evidence-test-001",
      "evidence-test-001",
    ],
  },
  includedEvidence as [],
);

assert.equal(deduplicated.citations.length, 1);

console.log("PASS: 重复引用去重");

/** 6. 空引用允许 */
const noCitation = resolveAgentAnswer(
  {
    answer: "当前证据不足。",
    citations: [],
  },
  includedEvidence as [],
);

assert.equal(noCitation.citations.length, 0);

console.log("PASS: 空引用处理");

/** 7. 非法 JSON 拒绝 */
assert.throws(
  () => parseLlmAnswer("not-json"),
  /INVALID_ANSWER_JSON/,
);

console.log("PASS: 非法 JSON 拒绝");

/** 8. 空答案拒绝 */
assert.throws(
  () =>
    parseLlmAnswer(
      JSON.stringify({
        answer: "",
        citations: [],
      }),
    ),
  /EMPTY_ANSWER/,
);

console.log("PASS: 空答案拒绝");

console.log("V9.8.5.3 Agent Answer 测试全部通过");
}

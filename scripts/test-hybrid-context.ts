
import assert from "node:assert/strict";
import {
  createUnifiedEvidence,
  type UnifiedEvidence,
} from "../lib/unified-evidence";
import {
  buildHybridContext,
} from "../lib/hybrid-context";

function createEvidence(
  content: string,
  chunkIndex: number,
  source: "vector" | "graph" = "vector",
): UnifiedEvidence {
  return createUnifiedEvidence({
    content,
    metadata: {
      source: "react/hooks.md",
      title: "React Hooks",
      section: `Section ${chunkIndex}`,
      chunkIndex,
    },
    source,
    score: source === "vector" ? 0.8 : undefined,
  });
}

function createOptions(contextWindow = 2000) {
  return {
    contextWindow,
    reservedOutputTokens: 0,
    safetyMargin: 0,
    tokenizer: {
      // 测试使用确定性的字符数估算，
      // 避免测试结果依赖真实模型 tokenizer。
      countTokens: (text: string) => text.length,
    },
  };
}

// 1. 同一 Chunk 来自 Vector 和 Graph 时，只保留一条 Evidence。
{
  const vectorEvidence = createEvidence(
    "useState 用于管理组件状态。",
    0,
    "vector",
  );

  const graphEvidence = createEvidence(
    "useState 用于管理组件状态。",
    0,
    "graph",
  );

  graphEvidence.graphRelations.push({
    edgeId: "edge-1",
    sourceEntityId: "useState",
    sourceEntityName: "useState",
    targetEntityId: "React",
    targetEntityName: "React",
    relation: "belongs_to",
    graphEvidenceId: "graph-evidence-1",
  });

  console.log(vectorEvidence, 'vectorEvidence');
  console.log(graphEvidence, 'graphEvidence');
  console.log("--------------------------------");
  
  const result = buildHybridContext(
    "你是一个技术问答助手。",
    "useState 是什么？",
    [vectorEvidence, graphEvidence],
    createOptions(),
  );

  assert.equal(result.includedEvidence.length, 1);

  const merged = result.includedEvidence[0];

  assert.deepEqual(
    merged.sources,
    ["vector", "graph"],
  );

  assert.equal(merged.graphRelations.length, 1);
  assert.ok(result.context.includes("edge-1"));
  assert.ok(result.context.includes("graph-evidence-1"));

  console.log("PASS: 重复 Evidence 合并与来源保留");
}

// 2. Context 必须保留原始文档元数据和 Graph 关系。
{
  const evidence = createEvidence(
    "React useEffect 用于处理副作用。",
    1,
    "graph",
  );

  evidence.graphRelations.push({
    edgeId: "edge-2",
    sourceEntityId: "useEffect",
    sourceEntityName: "useEffect",
    targetEntityId: "React",
    targetEntityName: "React",
    relation: "belongs_to",
    graphEvidenceId: "graph-evidence-2",
  });

  const result = buildHybridContext(
    "你是一个技术问答助手。",
    "useEffect 的作用是什么？",
    [evidence],
    createOptions(),
  );

  assert.ok(result.context.includes(evidence.id));
  assert.ok(result.context.includes("react/hooks.md"));
  assert.ok(result.context.includes("React Hooks"));
  assert.ok(result.context.includes("Section 1"));
  assert.ok(result.context.includes("useEffect"));
  assert.ok(result.context.includes("belongs_to"));
  assert.ok(result.context.includes(evidence.content));

  console.log("PASS: 原始元数据和 Graph 关系保留");
}

// 3. 超出预算时，只保留完整 Evidence，不截断内容。
{
  const evidence1 = createEvidence(
    "A".repeat(180),
    0,
  );

  const evidence2 = createEvidence(
    "B".repeat(180),
    1,
  );

  const result = buildHybridContext(
    "system",
    "question",
    [evidence1, evidence2],
    createOptions(450),
  );

  assert.equal(result.includedIds.length, 1);
  assert.equal(result.omittedIds.length, 1);
  assert.equal(result.truncated, true);

  const included = result.includedEvidence[0];
  const omitted = result.omittedEvidence[0];

  assert.ok(result.context.includes(included.content));
  assert.ok(!result.context.includes(omitted.content));

  // 被选中的 Chunk 必须完整保留。
  assert.equal(
    result.context.includes("A".repeat(180)) ||
      result.context.includes("B".repeat(180)),
    true,
  );

  assert.equal(
    result.includedIds[0],
    included.id,
  );

  assert.equal(
    result.omittedIds[0],
    omitted.id,
  );

  console.log("PASS: Token 超预算时完整筛选 Evidence");
}

// 4. 自定义优先级应当影响 Evidence 选择。
{
  const vectorEvidence = createEvidence(
    "VECTOR_CONTENT_" + "V".repeat(120),
    0,
    "vector",
  );

  const graphEvidence = createEvidence(
    "GRAPH_CONTENT_" + "G".repeat(120),
    1,
    "graph",
  );

  const result = buildHybridContext(
    "system",
    "question",
    [vectorEvidence, graphEvidence],
    {
      ...createOptions(450),
      getPriority: (item) =>
        item.sources.includes("graph") ? 100 : 1,
    },
  );

  assert.equal(result.includedIds.length, 1);
  assert.equal(
    result.includedIds[0],
    graphEvidence.id,
  );

  assert.equal(
    result.omittedIds[0],
    vectorEvidence.id,
  );

  console.log("PASS: 自定义优先级生效");
}

// 5. 空问题应当被拒绝。
{
  assert.throws(
    () =>
      buildHybridContext(
        "system",
        "   ",
        [],
        createOptions(),
      ),
    /HYBRID_CONTEXT_QUESTION_EMPTY/,
  );

  console.log("PASS: 空问题校验");
} 

console.log("\nV9.8.4 Hybrid Context 测试全部通过");

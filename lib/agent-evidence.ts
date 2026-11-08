
import {
    fromVectorChunk,
    fromKeywordChunk,
    fromGraphResult,
    mergeUnifiedEvidence,
    type UnifiedEvidence,
  } from "./unified-evidence";
  
  type UnknownRecord = Record<string, unknown>;
  
  function isRecord(value: unknown): value is UnknownRecord {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }
  
  function isString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
  
  function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
  
  function isUnifiedEvidence(
    value: unknown,
  ): value is UnifiedEvidence {
    if (!isRecord(value)) return false;
  
    return (
      isString(value.id) &&
      isString(value.content) &&
      Array.isArray(value.sources) &&
      isRecord(value.metadata) &&
      isRecord(value.scores) &&
      Array.isArray(value.graphRelations)
    );
  }
  
  // Vector Chunk 转换
  function normalizeVectorChunk(
    value: UnknownRecord,
  ): UnifiedEvidence {
    if (
      !isString(value.content) ||
      !isNumber(value.score) ||
      !isString(value.source) ||
      !isString(value.title) ||
      !isString(value.section) ||
      !Number.isInteger(value.chunkIndex) ||
      (value.chunkIndex as number) < 0
    ) {
      throw new Error("INVALID_VECTOR_CHUNK");
    }
  
    return fromVectorChunk({
      content: value.content,
      score: value.score,
      source: value.source,
      title: value.title,
      section: value.section,
      chunkIndex: value.chunkIndex as number,
    });
  }
  
  // Keyword Chunk 转换
  function normalizeKeywordChunk(
    value: UnknownRecord,
  ): UnifiedEvidence {
    if (
      !isString(value.content) ||
      !isNumber(value.keywordScore) ||
      !isString(value.source) ||
      !isString(value.title) ||
      !isString(value.section) ||
      !Number.isInteger(value.chunkIndex) ||
      (value.chunkIndex as number) < 0
    ) {
      throw new Error("INVALID_KEYWORD_CHUNK");
    }
  
    return fromKeywordChunk({
      content: value.content,
      keywordScore: value.keywordScore,
      source: value.source,
      title: value.title,
      section: value.section,
      chunkIndex: value.chunkIndex as number,
    });
  }
  
  // Graph Retrieval Result 转换
  function normalizeGraphResult(
    value: UnknownRecord,
  ): UnifiedEvidence[] {
    const nodes = [
      ...(Array.isArray(value.matchedNodes)
        ? value.matchedNodes
        : []),
      ...(Array.isArray(value.expandedNodes)
        ? value.expandedNodes
        : []),
    ];
  
    if (
      !Array.isArray(value.edges) ||
      !Array.isArray(value.evidence) ||
      !Array.isArray(value.chunks)
    ) {
      throw new Error("INVALID_GRAPH_RESULT");
    }
  
    const nodeMap = new Map<string, UnknownRecord>();
  
    for (const node of nodes) {
      if (
        isRecord(node) &&
        isString(node.id) &&
        isString(node.name)
      ) {
        nodeMap.set(node.id, node);
      }
    }
  
    return fromGraphResult({
      nodes: [...nodeMap.values()].map((node) => ({
        id: node.id as string,
        name: node.name as string,
      })),
      edges: value.edges as Parameters<
        typeof fromGraphResult
      >[0]["edges"],
      evidence: value.evidence as Parameters<
        typeof fromGraphResult
      >[0]["evidence"],
      chunks: value.chunks as Parameters<
        typeof fromGraphResult
      >[0]["chunks"],
    });
  }
  
  // 识别单个检索结果
  function normalizeOne(
    value: unknown,
  ): UnifiedEvidence[] {
    if (Array.isArray(value)) {
      return value.flatMap(normalizeOne);
    }
  
    if (!isRecord(value)) {
      return [];
    }
  
    // 已经是 UnifiedEvidence
    if (isUnifiedEvidence(value)) {
      return [value];
    }
  
    // Hybrid Retrieval Result
    // Hybrid 内部已经完成 Vector + Graph 转换和去重
    if (
      isRecord(value.vector) &&
      isRecord(value.graph) &&
      Array.isArray(value.evidence)
    ) {
      return value.evidence.map((item) => {
        if (!isUnifiedEvidence(item)) {
          throw new Error("INVALID_HYBRID_EVIDENCE");
        }
        return item;
      });
    }
  
    // Graph Retrieval Result
    if (
      Array.isArray(value.matchedNodes) ||
      Array.isArray(value.expandedNodes)
    ) {
      return normalizeGraphResult(value);
    }
  
    // Keyword Chunk
    if ("keywordScore" in value) {
      return [normalizeKeywordChunk(value)];
    }
  
    // Vector Chunk
    if ("score" in value) {
      return [normalizeVectorChunk(value)];
    }
  
    // Entity Lookup 不属于知识 Evidence
    if (
      value.status === "resolved" ||
      value.status === "ambiguous" ||
      value.status === "no_match"
    ) {
      return [];
    }
  
    throw new Error("UNSUPPORTED_AGENT_EVIDENCE");
  }
  
  /**
   * 将 Agent 多轮工具结果统一转换为 UnifiedEvidence[]
   */
  export function normalizeAgentEvidence(
    evidence: unknown[],
  ): UnifiedEvidence[] {
    const groups = evidence.map(normalizeOne);
  
    return mergeUnifiedEvidence(...groups);
  }
  

import { retrieve } from "./rag";

import {
  getDemoGraph,
  retrieveKnowledgeEvidence,
} from "./rag-knowledge";

import {
  fromVectorChunk,
  fromGraphResult,
  mergeUnifiedEvidence,
  type UnifiedEvidence,
} from "./unified-evidence";

/**
 * Hybrid Retriever 配置
 */
export interface HybridRetrieverOptions {
  vectorTopK?: number;
  scoreThreshold?: number;
  maxHops?: number;
}

/**
 * 单路检索状态
 */
export type RetrievalBranchStatus =
  | "success"
  | "failed";

/**
 * 整体混合检索状态
 */
export type HybridRetrievalStatus =
  | "success"
  | "partial"
  | "failed";

/**
 * Hybrid Retriever 返回结果
 */
export interface HybridRetrievalResult {
  query: string;

  status: HybridRetrievalStatus;

  evidence: UnifiedEvidence[];

  vector: {
    status: RetrievalBranchStatus;
    resultCount: number;
    error?: string;
  };

  graph: {
    status: RetrievalBranchStatus;
    resultCount: number;
    unresolvedCount: number;
    error?: string;
  };
}

/**
 * 将异常转换为可记录的错误信息
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Vector + Graph 混合检索
 *
 * 1. 并行执行 Vector Search 和 Graph Search
 * 2. 转换成 UnifiedEvidence
 * 3. 合并重复 Chunk
 * 4. 保留每路检索状态
 */
export async function retrieveHybrid(
  query: string,
  options: HybridRetrieverOptions = {},
): Promise<HybridRetrievalResult> {
  if (!query.trim()) {
    throw new Error("HYBRID_QUERY_EMPTY");
  }

  const {
    vectorTopK = 10,
    scoreThreshold = 0.3,
    maxHops = 1,
  } = options;

  if (!Number.isInteger(vectorTopK) || vectorTopK < 1) {
    throw new Error("INVALID_VECTOR_TOP_K");
  }

  if (!Number.isFinite(scoreThreshold)) {
    throw new Error("INVALID_SCORE_THRESHOLD");
  }

  if (!Number.isInteger(maxHops) || maxHops < 0) {
    throw new Error("INVALID_GRAPH_MAX_HOPS");
  }

  // ========================================
  // 1. 并行执行 Vector Search
  // ========================================

  const vectorTask = async () => {
    const chunks = await retrieve(
      query,
      vectorTopK,
      scoreThreshold,
    );

    return chunks.map((chunk) =>
      fromVectorChunk({
        content: chunk.content,
        score: chunk.score,
        source: chunk.source,
        title: chunk.title,
        section: chunk.section,
        chunkIndex: chunk.chunkIndex,
      }),
    );
  };

  // ========================================
  // 2. 并行执行 Graph Search
  // ========================================

  const graphTask = async () => {
    const graph = await getDemoGraph();

    const graphResult = await retrieveKnowledgeEvidence(
      graph,
      query,
      maxHops,
    );

    // matchedNodes 和 expandedNodes 可能存在重复节点
    const nodeMap = new Map(
      [
        ...graphResult.matchedNodes,
        ...graphResult.expandedNodes,
      ].map((node) => [node.id, node]),
    );

    // Graph 原始结果转换为 UnifiedEvidence
    const evidence = fromGraphResult({
      nodes: [...nodeMap.values()],
      edges: graphResult.edges,
      evidence: graphResult.evidence,
      chunks: graphResult.chunks,
    });

    return {
      evidence,
      unresolvedCount: graphResult.unresolvedEvidence.length,
    };
  };

  // ========================================
  // 3. 并行等待两路检索
  // ========================================

  const [vectorResult, graphResult] =
    await Promise.allSettled([
      vectorTask(),
      graphTask(),
    ]);

  // ========================================
  // 4. 处理 Vector 结果
  // ========================================

  const vectorEvidence =
    vectorResult.status === "fulfilled"
      ? vectorResult.value
      : [];

  const vectorStatus: RetrievalBranchStatus =
    vectorResult.status === "fulfilled"
      ? "success"
      : "failed";

  // ========================================
  // 5. 处理 Graph 结果
  // ========================================

  const graphEvidence =
    graphResult.status === "fulfilled"
      ? graphResult.value.evidence
      : [];

  const graphStatus: RetrievalBranchStatus =
    graphResult.status === "fulfilled"
      ? "success"
      : "failed";

  const unresolvedCount =
    graphResult.status === "fulfilled"
      ? graphResult.value.unresolvedCount
      : 0;

  // ========================================
  // 6. 融合两路 Evidence
  // ========================================

  const evidence = mergeUnifiedEvidence(
    vectorEvidence,
    graphEvidence,
  );

  // ========================================
  // 7. 确定整体状态
  // ========================================

  const failedCount = [
    vectorStatus,
    graphStatus,
  ].filter((status) => status === "failed").length;

  const status: HybridRetrievalStatus =
    failedCount === 2
      ? "failed"
      : failedCount === 1
        ? "partial"
        : "success";

  return {
    query,
    status,
    evidence,

    vector: {
      status: vectorStatus,
      resultCount: vectorEvidence.length,
      ...(vectorResult.status === "rejected"
        ? {
            error: getErrorMessage(vectorResult.reason),
          }
        : {}),
    },

    graph: {
      status: graphStatus,
      resultCount: graphEvidence.length,
      unresolvedCount,
      ...(graphResult.status === "rejected"
        ? {
            error: getErrorMessage(graphResult.reason),
          }
        : {}),
    },
  };
}

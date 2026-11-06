
import { createHash } from "node:crypto";

/**
 * Evidence 来源
 */
export type EvidenceSource =
  | "vector"
  | "keyword"
  | "graph";

/**
 * 原文 Chunk 的位置
 */
export interface EvidenceMetadata {
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
}

/**
 * Graph 关系信息
 *
 * 保留边的方向、关系类型以及实体信息。
 */
export interface GraphRelationEvidence {
  edgeId: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  relation: string;

  // 原始 KnowledgeEvidence ID
  graphEvidenceId: string;
}

/**
 * 不同检索方式的得分
 */
export interface EvidenceScores {
  vector?: number;
  keyword?: number;
}

/**
 * 统一 Evidence
 */
export interface UnifiedEvidence {
  // 基于原文 Chunk 元数据生成的稳定 ID
  id: string;

  // 原文内容
  content: string;

  // 同一 Chunk 可以被多种方式检索到
  sources: EvidenceSource[];

  // 保留各检索方式的得分
  scores: EvidenceScores;

  // 原文位置
  metadata: EvidenceMetadata;

  // Graph 关系上下文
  graphRelations: GraphRelationEvidence[];
}


interface GraphEvidenceInput {
    nodes: Array<{
      id: string;
      name: string;
    }>;
  
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      relation: string;
      evidenceIds: string[];
    }>;
  
    evidence: Array<{
      id: string;
      source: string;
      title: string;
      section: string;
      chunkIndex: number;
    }>;
  
    chunks: Array<{
      content: string;
      score?: number;
      source: string;
      title: string;
      section: string;
      chunkIndex: number;
    }>;
  }

/**
 * 生成稳定的 Evidence ID。
 *
 * 相同 source/title/section/chunkIndex
 * 无论检索结果排序如何，都得到相同 ID。
 */
export function createUnifiedEvidenceId(
  metadata: EvidenceMetadata,
): string {
  const key = JSON.stringify([
    metadata.source.trim(),
    metadata.title.trim(),
    metadata.section.trim(),
    metadata.chunkIndex,
  ]);

  const hash = createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 16);

  return `evidence-${hash}`;
}

/**
 * 生成原文 Chunk 的唯一定位 Key。
 */
export function createEvidenceKey(
  metadata: EvidenceMetadata,
): string {
  return JSON.stringify([
    metadata.source.trim(),
    metadata.title.trim(),
    metadata.section.trim(),
    metadata.chunkIndex,
  ]);
}

/**
 * 检查元数据是否合法。
 */
export function validateEvidenceMetadata(
  metadata: EvidenceMetadata,
): void {
  if (
    !metadata.source.trim() ||
    !metadata.title.trim() ||
    !metadata.section.trim()
  ) {
    throw new Error("INVALID_EVIDENCE_METADATA");
  }

  if (
    !Number.isInteger(metadata.chunkIndex) ||
    metadata.chunkIndex < 0
  ) {
    throw new Error("INVALID_EVIDENCE_CHUNK_INDEX");
  }
}

/**
 * 根据原文 Chunk 创建统一 Evidence。
 */
export function createUnifiedEvidence(input: {
  content: string;
  metadata: EvidenceMetadata;
  source: EvidenceSource;
  score?: number;
}): UnifiedEvidence {
  validateEvidenceMetadata(input.metadata);

  if (!input.content.trim()) {
    throw new Error("EMPTY_EVIDENCE_CONTENT");
  }

  if (
    input.score !== undefined &&
    !Number.isFinite(input.score)
  ) {
    throw new Error("INVALID_EVIDENCE_SCORE");
  }

  return {
    id: createUnifiedEvidenceId(input.metadata),
    content: input.content.trim(),
    sources: [input.source],
    scores: {
      ...(input.source === "vector" &&
      input.score !== undefined
        ? { vector: input.score }
        : {}),
      ...(input.source === "keyword" &&
      input.score !== undefined
        ? { keyword: input.score }
        : {}),
    },
    metadata: input.metadata,
    graphRelations: [],
  };
}

/**
 * Vector Search Chunk 转换
 */
export function fromVectorChunk(chunk: {
    content: string;
    score: number;
    source: string;
    title: string;
    section: string;
    chunkIndex: number;
  }): UnifiedEvidence {
    return createUnifiedEvidence({
      content: chunk.content,
      metadata: {
        source: chunk.source,
        title: chunk.title,
        section: chunk.section,
        chunkIndex: chunk.chunkIndex,
      },
      source: "vector",
      score: chunk.score,
    });
  }
  
  /**
   * Keyword Search Chunk 转换
   */
  export function fromKeywordChunk(chunk: {
    content: string;
    keywordScore: number;
    source: string;
    title: string;
    section: string;
    chunkIndex: number;
  }): UnifiedEvidence {
    return createUnifiedEvidence({
      content: chunk.content,
      metadata: {
        source: chunk.source,
        title: chunk.title,
        section: chunk.section,
        chunkIndex: chunk.chunkIndex,
      },
      source: "keyword",
      score: chunk.keywordScore,
    });
  }

/**
 * 合并同一原文 Chunk 的多种检索结果。
 *
 * 同一个 ID：
 * - 内容相同：合并来源、分数和关系。
 * - 内容不同：抛出异常，避免错误合并。
 */
export function mergeUnifiedEvidence(
    ...groups: UnifiedEvidence[][]
  ): UnifiedEvidence[] {
    console.log(groups,'groups');
    const result = new Map<string, UnifiedEvidence>();
  
    for (const group of groups) {
      for (const item of group) {
        const existing = result.get(item.id);
  
        if (!existing) {
          result.set(item.id, {
            ...item,
            sources: [...new Set(item.sources)],
            scores: { ...item.scores },
            graphRelations: [...item.graphRelations],
          });
          continue;
        }
  
        if (
          existing.content !== item.content ||
          createEvidenceKey(existing.metadata) !==
            createEvidenceKey(item.metadata)
        ) {
          throw new Error(
            `EVIDENCE_ID_CONTENT_CONFLICT: ${item.id}`,
          );
        }
  
        const graphRelations = new Map(
          existing.graphRelations.map((relation) => [
            `${relation.edgeId}:${relation.graphEvidenceId}`,
            relation,
          ]),
        );
  
        for (const relation of item.graphRelations) {
          graphRelations.set(
            `${relation.edgeId}:${relation.graphEvidenceId}`,
            relation,
          );
        }
  
        result.set(item.id, {
          ...existing,
          sources: [
            ...new Set([
              ...existing.sources,
              ...item.sources,
            ]),
          ],
          scores: {
            ...existing.scores,
            ...item.scores,
          },
          graphRelations: [...graphRelations.values()],
        });
      }
    }
  
    return [...result.values()];
  }

  
  /**
   * Graph Search 结果转换。
   *
   * 只有成功找回原文 Chunk 的 Evidence
   * 才会转换为 UnifiedEvidence。
   */
  export function fromGraphResult(
    graph: GraphEvidenceInput,
  ): UnifiedEvidence[] {
    const nodeById = new Map(
      graph.nodes.map((node) => [node.id, node]),
    );
  
    const evidenceById = new Map(
      graph.evidence.map((item) => [item.id, item]),
    );
  
    // 原文位置 -> Graph Evidence
    const evidenceByKey = new Map<
      string,
      typeof graph.evidence
    >();
  
    for (const item of graph.evidence) {
      const metadata = {
        source: item.source,
        title: item.title,
        section: item.section,
        chunkIndex: item.chunkIndex,
      };
  
      const key = createEvidenceKey(metadata);
      const items = evidenceByKey.get(key) ?? [];
  
      items.push(item);
      evidenceByKey.set(key, items);
    }
  
    // Graph Evidence ID -> Graph Relations
    const relationsByEvidenceId = new Map<
      string,
      GraphRelationEvidence[]
    >();
  
    for (const edge of graph.edges) {
      const sourceNode = nodeById.get(edge.sourceId);
      const targetNode = nodeById.get(edge.targetId);
  
      if (!sourceNode || !targetNode) {
        throw new Error(
          `GRAPH_EDGE_NODE_NOT_FOUND: ${edge.id}`,
        );
      }
  
      for (const evidenceId of edge.evidenceIds) {
        if (!evidenceById.has(evidenceId)) {
          throw new Error(
            `GRAPH_EVIDENCE_NOT_FOUND: ${evidenceId}`,
          );
        }
  
        const relations =
          relationsByEvidenceId.get(evidenceId) ?? [];
  
        relations.push({
          edgeId: edge.id,
          sourceEntityId: edge.sourceId,
          sourceEntityName: sourceNode.name,
          targetEntityId: edge.targetId,
          targetEntityName: targetNode.name,
          relation: edge.relation,
          graphEvidenceId: evidenceId,
        });
  
        relationsByEvidenceId.set(
          evidenceId,
          relations,
        );
      }
    }
  
    const result: UnifiedEvidence[] = [];
  
    for (const chunk of graph.chunks) {
      const metadata = {
        source: chunk.source,
        title: chunk.title,
        section: chunk.section,
        chunkIndex: chunk.chunkIndex,
      };
  
      const key = createEvidenceKey(metadata);
      const linkedEvidence = evidenceByKey.get(key) ?? [];
  
      const graphRelations = linkedEvidence.flatMap(
        (item) =>
          relationsByEvidenceId.get(item.id) ?? [],
      );
  
      const unified = createUnifiedEvidence({
        content: chunk.content,
        metadata,
        source: "graph",
        score: chunk.score,
      });
  
      unified.graphRelations = graphRelations;
  
      result.push(unified);
    }
  
    return result;
  }
      
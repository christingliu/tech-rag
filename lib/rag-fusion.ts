
/**
 * lib/rag-fusion.ts
 *
 * 独立的 Vector RAG + Graph RAG 结果融合层。
 * 不负责检索、Embedding 或 LLM 生成。
 */

export type FusionSource = "vector" | "graph" | "both";

export interface FusionVectorChunk {
  id: string;
  content: string;
  source: string;
  title?: string;
  section?: string;
  chunkIndex?: number;
  score?: number;
}

export interface FusionGraphEvidence {
  id: string;
  source: string;
  title?: string;
  section?: string;
  chunkIndex?: number;

  // 图谱 Evidence 本身可能只有元数据，没有原文。
  content?: string;

  // 用于追踪该证据支持哪些关系。
  edgeIds?: string[];
}

export interface FusionGraphResult {
  status: "no_match" | "ambiguous" | "resolved";
  evidence: FusionGraphEvidence[];
}

export interface FusionOptions {
  vectorWeight?: number;
  graphWeight?: number;
  rrfK?: number;
  maxResults?: number;
}

export interface FusedChunk {
  id: string;
  content?: string;

  source: string;
  title?: string;
  section?: string;
  chunkIndex?: number;

  fusionScore: number;
  retrievalSource: FusionSource;

  vectorRank?: number;
  graphRank?: number;

  evidenceIds: string[];
  edgeIds: string[];
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 优先使用稳定的原始 Chunk 定位信息去重。
 * 缺少 chunkIndex 时，退回到来源、标题、章节和内容。
 */
function getChunkKey(item: {
  source: string;
  title?: string;
  section?: string;
  chunkIndex?: number;
  content?: string;
}): string {
  const source = normalizeText(item.source);

  if (item.chunkIndex !== undefined) {
    return [
      source,
      item.chunkIndex,
    ].join("::");
  }

  return [
    source,
    normalizeText(item.title ?? ""),
    normalizeText(item.section ?? ""),
    normalizeText(item.content ?? ""),
  ].join("::");
}

function mergeUnique(
  current: string[],
  incoming: string[],
): string[] {
  return [...new Set([...current, ...incoming])];
}

export function fuseRetrievalResults(
  vectorChunks: FusionVectorChunk[],
  graphResult: FusionGraphResult,
  options: FusionOptions = {},
): FusedChunk[] {
  const {
    vectorWeight = 1,
    graphWeight = 1,
    rrfK = 60,
    maxResults = 10,
  } = options;

  if (
    !Number.isFinite(vectorWeight) ||
    vectorWeight < 0 ||
    !Number.isFinite(graphWeight) ||
    graphWeight < 0
  ) {
    throw new Error("Fusion weights must be non-negative");
  }

  if (!Number.isInteger(rrfK) || rrfK < 1) {
    throw new Error("rrfK must be a positive integer");
  }

  if (!Number.isInteger(maxResults) || maxResults < 0) {
    throw new Error("maxResults must be a non-negative integer");
  }

  const results = new Map<string, FusedChunk>();

  // 1. 融合 Vector RAG 排名。
  vectorChunks.forEach((chunk, index) => {
    const key = getChunkKey(chunk);
    const rank = index + 1;
    const existing = results.get(key);

    const score = vectorWeight / (rrfK + rank);

    if (existing) {
      existing.fusionScore += score;
      existing.vectorRank ??= rank;
      existing.retrievalSource =
        existing.graphRank !== undefined ? "both" : "vector";
      existing.content ??= chunk.content;
      existing.evidenceIds = mergeUnique(
        existing.evidenceIds,
        [],
      );
      return;
    }

    results.set(key, {
      id: chunk.id,
      content: chunk.content,
      source: chunk.source,
      title: chunk.title,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      fusionScore: score,
      retrievalSource: "vector",
      vectorRank: rank,
      evidenceIds: [],
      edgeIds: [],
    });
  });

  // 2. Graph 未消歧时，不把候选关系证据作为已确认的检索结果。
  const graphEvidence =
    graphResult.status === "resolved"
      ? graphResult.evidence
      : [];

  // 3. 融合 Graph RAG Evidence。
  graphEvidence.forEach((evidence, index) => {
    const key = getChunkKey(evidence);
    const rank = index + 1;
    const score = graphWeight / (rrfK + rank);
    const existing = results.get(key);

    if (existing) {
      existing.fusionScore += score;
      existing.graphRank ??= rank;
      existing.retrievalSource = "both";
      existing.evidenceIds = mergeUnique(
        existing.evidenceIds,
        [evidence.id],
      );
      existing.edgeIds = mergeUnique(
        existing.edgeIds,
        evidence.edgeIds ?? [],
      );
      existing.content ??= evidence.content;
      existing.title ??= evidence.title;
      existing.section ??= evidence.section;
      return;
    }

    results.set(key, {
      id: evidence.id,
      content: evidence.content,
      source: evidence.source,
      title: evidence.title,
      section: evidence.section,
      chunkIndex: evidence.chunkIndex,
      fusionScore: score,
      retrievalSource: "graph",
      graphRank: rank,
      evidenceIds: [evidence.id],
      edgeIds: [...new Set(evidence.edgeIds ?? [])],
    });
  });

  // 4. 分数降序；同分时用稳定键保证排序确定性。
  return [...results.entries()]
    .sort(([keyA, a], [keyB, b]) =>
      b.fusionScore - a.fusionScore ||
      keyA.localeCompare(keyB),
    )
    .slice(0, maxResults)
    .map(([, result]) => result);
}
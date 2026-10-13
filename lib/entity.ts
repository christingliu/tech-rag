import type { KnowledgeGraph } from "./rag-knowledge";

export type KnowledgeNodeType = "entity" | "concept";

export interface KnowledgeNode {
  /** 稳定的规范实体 ID，不随显示名称变化 */
  id: string;
  /** 规范名称 */
  name: string;
  type: KnowledgeNodeType;
  /** 其他已确认指向同一实体的名称 */
  aliases: string[];
}

export interface EntityMatchResult {
  query: string;
  normalizedQuery: string;
  candidateIds: string[];
  ambiguous: boolean;
}

export interface EntityResolution {
  query: string;
  candidateIds: string[];
  selectedId: string | null;
  ambiguous: boolean;
  reason: string;
  scores: Array<{
    nodeId: string;
    score: number;
    matchedContext: string[];
  }>;
}

interface ResolveEntityOptions {
  /** 可选的领域约束，例如只允许匹配 concept */
  expectedType?: KnowledgeNodeType;
  /** 最佳与次佳候选至少相差多少分才自动选择 */
  minScoreMargin?: number;
}

function tokenize(text: string): string[] {
  return normalizeEntityName(text)
    .match(/[\p{L}\p{N}_-]+/gu) ?? [];
}

/**
 * 利用候选节点的邻接节点，为歧义候选计算上下文相关性。
 *
 * 注意：这是确定性的词项匹配基线，不是语义模型。
 */
export function resolveEntityWithContext(
  query: string,
  candidateIds: string[],
  graph: KnowledgeGraph,
  options: ResolveEntityOptions = {}
): EntityResolution {
  const minScoreMargin = options.minScoreMargin ?? 1;

  const nodeById = new Map(
    graph.nodes.map((node) => [node.id, node])
  );

  const queryTokens = new Set(tokenize(query));

  const candidates = candidateIds
    .map((id) => nodeById.get(id))
    .filter((node) => node !== undefined);

  // 查询为空，或候选 ID 不在当前图谱中。
  if (!query.trim() || candidates.length === 0) {
    return {
      query,
      candidateIds,
      selectedId: null,
      ambiguous: candidateIds.length > 0,
      reason: "empty-query-or-missing-candidate",
      scores: [],
    };
  }

  // 唯一候选不需要消歧，但必须确保该 ID 存在于图谱。
  if (candidates.length === 1) {
    const node = candidates[0];

    if (
      options.expectedType &&
      node.type !== options.expectedType
    ) {
      return {
        query,
        candidateIds,
        selectedId: null,
        ambiguous: true,
        reason: "candidate-type-mismatch",
        scores: [],
      };
    }

    return {
      query,
      candidateIds,
      selectedId: node.id,
      ambiguous: false,
      reason: "single-candidate",
      scores: [{ nodeId: node.id, score: 0, matchedContext: [] }],
    };
  }

  const scores = candidates.map((candidate) => {
    const matchedContext = new Set<string>();
    let score = 0;

    if (
      options.expectedType &&
      candidate.type !== options.expectedType
    ) {
      return {
        nodeId: candidate.id,
        score: Number.NEGATIVE_INFINITY,
        matchedContext: [],
      };
    }

    // 查找候选节点的一跳邻居。
    const neighborIds = new Set<string>();

    for (const edge of graph.edges) {
      if (edge.sourceId === candidate.id) {
        neighborIds.add(edge.targetId);
      }

      if (edge.targetId === candidate.id) {
        neighborIds.add(edge.sourceId);
      }
    }

    for (const neighborId of neighborIds) {
      const neighbor = nodeById.get(neighborId);
      if (!neighbor) continue;

      const neighborNames = [
        neighbor.name,
        ...neighbor.aliases,
      ];

      for (const name of neighborNames) {
        for (const token of tokenize(name)) {
          // 只计算查询中出现的上下文词。
          if (
            queryTokens.has(token) &&
            token.length > 1
          ) {
            matchedContext.add(token);
          }
        }
      }
    }

    // 每个上下文词只计一次，避免重复别名抬高分数。
    score += matchedContext.size;

    return {
      nodeId: candidate.id,
      score,
      matchedContext: [...matchedContext],
    };
  });

  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];

  const hasContextEvidence = best.score > 0;
  const sufficientMargin =
    best.score - second.score >= minScoreMargin;

  const selectedId =
    hasContextEvidence && sufficientMargin
      ? best.nodeId
      : null;

  return {
    query,
    candidateIds,
    selectedId,
    ambiguous: selectedId === null,
    reason: selectedId
      ? "context-score-and-margin-sufficient"
      : "insufficient-context-or-score-margin",
    scores,
  };
}

export type AliasIndex = Map<string, string[]>;

/**
 * 仅统一字符串形式，不负责判断两个名称是否语义相同。
 */
export function normalizeEntityName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * 为规范名称和别名建立反向索引。
 * 同一个名称可以对应多个实体，必须保留全部候选。
 */
export function buildAliasIndex(
  nodes: KnowledgeNode[]
): AliasIndex {
  const index: AliasIndex = new Map();
  const seenNodeIds = new Set<string>();

  for (const node of nodes) {
    if (!node.id.trim()) {
      throw new Error("KnowledgeNode.id cannot be empty");
    }

    if (!node.name.trim()) {
      throw new Error(
        `KnowledgeNode.name cannot be empty: ${node.id}`
      );
    }

    if (seenNodeIds.has(node.id)) {
      throw new Error(`Duplicate KnowledgeNode.id: ${node.id}`);
    }

    seenNodeIds.add(node.id);

    for (const name of [node.name, ...node.aliases]) {
      const key = normalizeEntityName(name);

      // 忽略空名称，避免建立空字符串索引。
      if (!key) continue;

      const candidateIds = index.get(key) ?? [];

      // 同一个节点的 name 和 alias 可能重复，只登记一次。
      if (!candidateIds.includes(node.id)) {
        candidateIds.push(node.id);
      }

      index.set(key, candidateIds);
    }
  }

  return index;
}

/**
 * 第一版只做规范名称/别名的精确匹配。
 * 不自动选择歧义候选，也不进行模糊匹配。
 */
export function matchEntity(
  query: string,
  aliasIndex: AliasIndex
): EntityMatchResult {
  const normalizedQuery = normalizeEntityName(query);

  const candidateIds = normalizedQuery
    ? [...(aliasIndex.get(normalizedQuery) ?? [])]
    : [];

  return {
    query,
    normalizedQuery,
    candidateIds,
    ambiguous: candidateIds.length > 1,
  };
}

/**
 * lib/rag-knowledge.ts
 *
 * V8.1: Standalone Knowledge Graph Retrieval
 *
 * 不依赖：
 * - Qdrant
 * - Embedding
 * - LLM
 * - rag.ts / rag-hyde.ts
 *
 * 目标：
 * 1. 根据 query 匹配图谱节点
 * 2. 沿关系扩展指定跳数
 * 3. 返回相关边及其 Evidence
 * 4. 校验图谱引用完整性
 */

import {
    retrieve,
    type RetrievalFilter,
  } from "./rag";

import {
    buildAliasIndex,
    matchEntity,
    normalizeEntityName,
    resolveEntityWithContext,
  } from "./entity";

import type {
  KnowledgeNode,
  KnowledgeEvidence,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeRetrievalResult,
  GraphTraversalOptions
} from "./knowledge-type";

  async function loadDemoEvidence() {
    const chunks = await retrieve(
      "React useState 状态管理",
      10,
      -1,
    );
  
    if (chunks.length === 0) {
      throw new Error(
        "没有检索到真实 Chunk，无法构建 demoGraph Evidence",
      );
    }
  
    return chunks.map((chunk, index) => ({
      id: `evidence-${index + 1}`,
      source: chunk.source,
      title: chunk.title,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
    }));
  }

  // ============================================================
  // 1. 示例图谱
  //
  // 第一阶段手动构造，用于验证图检索逻辑。
  // Evidence 通过 loadDemoEvidence 从真实知识库加载，
  // 因此图谱本身通过 getDemoGraph() 惰性获取，
  // 避免模块顶层副作用（import 即发起网络请求）。
  // ============================================================

  const demoNodes: KnowledgeNode[] = [
    {
      id: "react",
      name: "React",
      type: "technology",
      aliases: ["React.js", "ReactJS"],
      description: "用于构建用户界面的 JavaScript 库",
    },
    {
      id: "use-state",
      name: "useState",
      type: "api",
      aliases: ["useState Hook", "状态 Hook"],
      description: "用于在函数组件中添加状态的 Hook",
    },
    {
      id: "use-effect",
      name: "useEffect",
      type: "api",
      aliases: ["useEffect Hook", "Effect Hook"],
      description: "用于同步组件与外部系统的 Hook",
    },
    {
      id: "component-state",
      name: "组件状态",
      type: "concept",
      aliases: ["state", "component state"],
      description: "用于描述组件需要跟踪的数据",
    },
    {
      id: "side-effect",
      name: "副作用",
      type: "concept",
      aliases: ["side effect", "外部系统同步"],
      description: "渲染以外、需要与外部系统同步的操作",
    },
  ];

  const demoEdges: KnowledgeEdge[] = [
    {
      id: "edge-1",
      sourceId: "use-state",
      targetId: "component-state",
      relation: "manages",
      evidenceIds: ["evidence-1"],
    },
    {
      id: "edge-2",
      sourceId: "use-state",
      targetId: "react",
      relation: "belongs_to",
      evidenceIds: ["evidence-2"],
    },
    {
      id: "edge-3",
      sourceId: "use-effect",
      targetId: "side-effect",
      relation: "handles",
      evidenceIds: ["evidence-3"],
    },
    {
      id: "edge-4",
      sourceId: "use-effect",
      targetId: "react",
      relation: "belongs_to",
      evidenceIds: ["evidence-4"],
    },
  ];

  let demoGraphPromise: Promise<KnowledgeGraph> | null = null;

  /**
   * 惰性加载示例图谱。
   *
   * Evidence 从 Qdrant 真实检索构建，
   * 结果缓存，多次调用只检索一次。
   */
  export function getDemoGraph(): Promise<KnowledgeGraph> {
    if (!demoGraphPromise) {
      demoGraphPromise = loadDemoEvidence().then(
        (evidence) => ({
          nodes: demoNodes,
          edges: demoEdges,
          evidence,
        }),
      );
    }

    return demoGraphPromise;
  }
  
  // ============================================================
  // 2. 文本规范化
  // ============================================================
  
  function normalizeText(value: string): string {
    return value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, "");
  }
  
  // ============================================================
  // 3. 校验图谱
  // ============================================================
  
  
export function validateKnowledgeGraph(
    graph: KnowledgeGraph,
  ): string[] {
    const errors: string[] = [];
  
    // 0. 校验图谱顶层结构，避免运行时数据不是合法对象。
    if (
      !graph ||
      typeof graph !== "object" ||
      !Array.isArray(graph.nodes) ||
      !Array.isArray(graph.edges) ||
      !Array.isArray(graph.evidence)
    ) {
      return [
        "KnowledgeGraph 结构无效：nodes、edges、evidence 必须是数组",
      ];
    }
  
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const evidenceIds = new Set<string>();
  
    const allowedNodeTypes = new Set([
      "technology",
      "api",
      "concept",
    ]);
  
    const isNonEmptyString = (
      value: unknown,
    ): value is string =>
      typeof value === "string" && value.trim().length > 0;
  
    // 1. 校验节点结构。
    for (const node of graph.nodes) {
      if (!node || typeof node !== "object") {
        errors.push("节点数据无效：节点必须是对象");
        continue;
      }
  
      const validId = isNonEmptyString(node.id);
      const validName = isNonEmptyString(node.name);
  
      if (!validId) {
        errors.push("节点 ID 不能为空");
      } else if (nodeIds.has(node.id)) {
        errors.push(`重复节点 ID: ${node.id}`);
      }
  
      if (validId) {
        nodeIds.add(node.id);
      }
  
      if (!validName) {
        errors.push(
          `节点 ${validId ? node.id : "(无效 ID)"} 的名称不能为空`,
        );
      }
  
      if (!allowedNodeTypes.has(node.type)) {
        errors.push(
          `节点 ${validId ? node.id : "(无效 ID)"} 的类型非法: ${String(node.type)}`,
        );
      }
  
      if (!Array.isArray(node.aliases)) {
        errors.push(
          `节点 ${validId ? node.id : "(无效 ID)"} 的 aliases 必须是数组`,
        );
        continue;
      }
  
      const aliasesSeen = new Set<string>();
  
      for (const alias of node.aliases) {
        if (!isNonEmptyString(alias)) {
          errors.push(
            `节点 ${validId ? node.id : "(无效 ID)"} 存在空别名或非字符串别名`,
          );
          continue;
        }
  
        const normalizedAlias = normalizeText(alias);
  
        if (aliasesSeen.has(normalizedAlias)) {
          errors.push(
            `节点 ${validId ? node.id : "(无效 ID)"} 存在重复别名: ${alias}`,
          );
        }
  
        aliasesSeen.add(normalizedAlias);
      }
  
      if (
        node.description !== undefined &&
        typeof node.description !== "string"
      ) {
        errors.push(
          `节点 ${validId ? node.id : "(无效 ID)"} 的 description 必须是字符串`,
        );
      }
    }
  
    // 2. 校验 Evidence 结构。
    for (const item of graph.evidence) {
      if (!item || typeof item !== "object") {
        errors.push("Evidence 数据无效：必须是对象");
        continue;
      }
  
      const validId = isNonEmptyString(item.id);
  
      if (!validId) {
        errors.push("Evidence ID 不能为空");
      } else if (evidenceIds.has(item.id)) {
        errors.push(`重复 Evidence ID: ${item.id}`);
      }
  
      if (validId) {
        evidenceIds.add(item.id);
      }
  
      const label = validId
        ? `Evidence ${item.id}`
        : "Evidence (无效 ID)";
  
      if (!isNonEmptyString(item.source)) {
        errors.push(`${label} 的 source 不能为空`);
      }
  
      if (!isNonEmptyString(item.title)) {
        errors.push(`${label} 的 title 不能为空`);
      }
  
      if (!isNonEmptyString(item.section)) {
        errors.push(`${label} 的 section 不能为空`);
      }
  
      if (
        !Number.isInteger(item.chunkIndex) ||
        item.chunkIndex < 0
      ) {
        errors.push(
          `${label} 的 chunkIndex 必须是非负整数`,
        );
      }
    }
  
    // 3. 校验边结构及引用完整性。
    for (const edge of graph.edges) {
      if (!edge || typeof edge !== "object") {
        errors.push("边数据无效：边必须是对象");
        continue;
      }
  
      const validId = isNonEmptyString(edge.id);
  
      if (!validId) {
        errors.push("边 ID 不能为空");
      } else if (edgeIds.has(edge.id)) {
        errors.push(`重复边 ID: ${edge.id}`);
      }
  
      if (validId) {
        edgeIds.add(edge.id);
      }
  
      const label = validId ? `边 ${edge.id}` : "边 (无效 ID)";
  
      if (!isNonEmptyString(edge.sourceId)) {
        errors.push(`${label} 的 sourceId 不能为空`);
      } else if (!nodeIds.has(edge.sourceId)) {
        errors.push(
          `${label} 引用了不存在的 source 节点: ${edge.sourceId}`,
        );
      }
  
      if (!isNonEmptyString(edge.targetId)) {
        errors.push(`${label} 的 targetId 不能为空`);
      } else if (!nodeIds.has(edge.targetId)) {
        errors.push(
          `${label} 引用了不存在的 target 节点: ${edge.targetId}`,
        );
      }
  
      if (!isNonEmptyString(edge.relation)) {
        errors.push(`${label} 的 relation 不能为空`);
      }
  
      if (!Array.isArray(edge.evidenceIds)) {
        errors.push(
          `${label} 的 evidenceIds 必须是数组`,
        );
        continue;
      }
  
      const edgeEvidenceIds = new Set<string>();
  
      for (const evidenceId of edge.evidenceIds) {
        if (!isNonEmptyString(evidenceId)) {
          errors.push(
            `${label} 存在空 Evidence ID 或非字符串 Evidence ID`,
          );
          continue;
        }
  
        if (edgeEvidenceIds.has(evidenceId)) {
          errors.push(
            `${label} 存在重复 Evidence 引用: ${evidenceId}`,
          );
        }
  
        edgeEvidenceIds.add(evidenceId);
  
        if (!evidenceIds.has(evidenceId)) {
          errors.push(
            `${label} 引用了不存在的 Evidence: ${evidenceId}`,
          );
        }
      }
    }
  
    return errors;
  }
  
  // ============================================================
  // 4. 查询节点匹配
  //
  // 支持：
  // - 节点名称
  // - aliases
  // - 多个匹配节点
  //
  // 当前采用规范化后的包含匹配，不使用语义向量。
  // ============================================================
  
  export function findGraphNodes(
    graph: KnowledgeGraph,
    query: string,
  ): KnowledgeNode[] {
    const normalizedQuery = normalizeText(query);
  
    if (!normalizedQuery) {
      return [];
    }

    return graph.nodes.filter((node) => {
      const names = [node.name, ...node.aliases];
  
      return names.some((name) => {
        const normalizedName = normalizeText(name);

        return (
          normalizedName.length > 0 &&
          normalizedQuery.includes(normalizedName)
        );
      });
    });
  }
  
  // ============================================================
  // 5. 图谱检索
  //
  // 默认按无向方式扩展：
  // - 可以从 source 找到 target
  // - 也可以从 target 找到 source
  //
  // maxHops = 1：只扩展一跳
  // maxHops = 2：最多扩展两跳
  // ============================================================
  
  
export function retrieveKnowledgeGraph(
  graph: KnowledgeGraph,
  query: string,
  maxHops = 1,
  options: GraphTraversalOptions = {},
): KnowledgeRetrievalResult {
  if (!Number.isInteger(maxHops) || maxHops < 0) {
    throw new Error("maxHops 必须是非负整数");
  }

  const {
    allowedRelations,
    direction = "both",
    maxNodes = 100,
    relationPriority = [],
  } = options;

  if (!["outgoing", "incoming", "both"].includes(direction)) {
    throw new Error("direction 必须是 outgoing、incoming 或 both");
  }

  if (!Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new Error("maxNodes 必须是正整数");
  }

  if (
    allowedRelations !== undefined &&
    (!Array.isArray(allowedRelations) ||
      allowedRelations.some(
        (relation) =>
          typeof relation !== "string" || !relation.trim(),
      ))
  ) {
    throw new Error("allowedRelations 必须是非空字符串组成的数组");
  }

  const errors = validateKnowledgeGraph(graph);
  if (errors.length > 0) {
    throw new Error(`KnowledgeGraph 校验失败:\n${errors.join("\n")}`);
  }

  // 1. 建立别名索引。
  const aliasIndex = buildAliasIndex(
    graph.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      aliases: node.aliases,
    })),
  );

  // 2. 提取候选实体。
  const normalizedQuery = normalizeEntityName(query);
  const candidateIds = new Set<string>();

  for (const [alias, ids] of aliasIndex) {
    if (!normalizedQuery.includes(alias)) continue;

    for (const id of ids) {
      candidateIds.add(id);
    }
  }

  // 3. 实体消歧：只有 resolved 才能启动 BFS。
  const resolution = resolveEntityWithContext(
    query,
    [...candidateIds],
    graph,
  );

  const status =
    resolution.selectedId
      ? "resolved"
      : candidateIds.size === 0
        ? "no_match"
        : "ambiguous";

  const nodeById = new Map(
    graph.nodes.map((node) => [node.id, node]),
  );

  const matchedNodes =
    status === "resolved"
      ? [nodeById.get(resolution.selectedId!)!]
      : status === "ambiguous"
        ? graph.nodes.filter((node) => candidateIds.has(node.id))
        : [];

  const startIds =
    status === "resolved" ? matchedNodes.map((node) => node.id) : [];

  // maxNodes 包含起始实体。
  const visited = new Set<string>();
  const frontier = new Set<string>();

  for (const id of startIds) {
    if (visited.size >= maxNodes) break;
    visited.add(id);
    frontier.add(id);
  }

  const relationOrder = new Map(
    relationPriority.map((relation, index) => [relation, index]),
  );

  const sortedEdges = [...graph.edges].sort((a, b) => {
    const priorityA = relationOrder.get(a.relation) ?? Infinity;
    const priorityB = relationOrder.get(b.relation) ?? Infinity;

    return (
      priorityA - priorityB ||
      a.relation.localeCompare(b.relation) ||
      a.id.localeCompare(b.id)
    );
  });

  const selectedEdges = new Map<string, KnowledgeEdge>();

  for (let hop = 0; hop < maxHops && frontier.size > 0; hop++) {
    const nextFrontier = new Set<string>();

    for (const edge of sortedEdges) {
      if (
        allowedRelations &&
        !allowedRelations.includes(edge.relation)
      ) {
        continue;
      }

      const canFollowOutgoing =
        direction !== "incoming" && frontier.has(edge.sourceId);

      const canFollowIncoming =
        direction !== "outgoing" && frontier.has(edge.targetId);

      if (!canFollowOutgoing && !canFollowIncoming) continue;

      // 对于 both，当前边可能从两个已访问端点接触。
      const neighbors: string[] = [];

      if (canFollowOutgoing) neighbors.push(edge.targetId);
      if (canFollowIncoming) neighbors.push(edge.sourceId);

      let accepted = false;

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          accepted = true;
          continue;
        }

        if (visited.size >= maxNodes) continue;

        visited.add(neighborId);
        nextFrontier.add(neighborId);
        accepted = true;
      }

      // 只保留实际参与到受限遍历结果中的边。
      if (accepted) selectedEdges.set(edge.id, edge);
    }

    frontier.clear();
    for (const id of nextFrontier) frontier.add(id);
  }

  const expandedNodes = [...visited]
    .map((id) => nodeById.get(id))
    .filter((node): node is KnowledgeNode => node !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges = [...selectedEdges.values()].sort(
    (a, b) => a.id.localeCompare(b.id),
  );

  const evidenceById = new Map(
    graph.evidence.map((item) => [item.id, item]),
  );

  const evidenceIds = new Set(
    edges.flatMap((edge) => edge.evidenceIds),
  );

  const evidence = [...evidenceIds]
    .map((id) => evidenceById.get(id))
    .filter((item): item is KnowledgeEvidence => item !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    query,
    status,
    matchedNodes,
    expandedNodes,
    edges,
    evidence,
  };
}
  
  // ============================================================
  // 6. 打印检索结果
  // ============================================================
  
  export function printKnowledgeResults(
    result: KnowledgeRetrievalResult,
  ): void {
    console.log("\n========== Graph Retrieval ==========");
    console.log("Query:", result.query);
  
    console.log("\nMatched Nodes:");
    for (const node of result.matchedNodes) {
      console.log(`- ${node.name} (${node.type}, ${node.id})`);
    }
  
    console.log("\nExpanded Nodes:");
    for (const node of result.expandedNodes) {
      console.log(`- ${node.name} (${node.id})`);
    }
  
    console.log("\nEdges:");
    for (const edge of result.edges) {
      console.log(
        `- ${edge.sourceId} --${edge.relation}--> ${edge.targetId}`,
      );
    }
  
    console.log("\nEvidence:");
    for (const item of result.evidence) {
      console.log(
        `- ${item.source} | ${item.title} | ${item.section} | chunk ${item.chunkIndex}`,
      );
    }
  
    console.log("\nCounts:");
    console.log("Matched nodes:", result.matchedNodes.length);
    console.log("Expanded nodes:", result.expandedNodes.length);
    console.log("Edges:", result.edges.length);
    console.log("Evidence:", result.evidence.length);
  
    console.log("=====================================\n");
  }

  export async function retrieveKnowledgeEvidence(
    graph: KnowledgeGraph,
    query: string,
    maxHops = 1,
  ) {
    // 1. 先执行纯图谱检索
    const graphResult = retrieveKnowledgeGraph(
      graph,
      query,
      maxHops,
    );
  
    // 2. 根据 source + chunkIndex 去重 Evidence
    const uniqueEvidence = new Map<
      string,
      KnowledgeEvidence
    >();
  
    for (const evidence of graphResult.evidence) {
      const key = getEvidenceKey(evidence);
  
      if (!uniqueEvidence.has(key)) {
        uniqueEvidence.set(key, evidence);
      }
    }
  
    // 3. 根据 Evidence 元数据找回真实 Chunk
    const chunksByKey = new Map<
      string,
      Awaited<ReturnType<typeof retrieve>>[number]
    >();
  
    const unresolvedEvidence: KnowledgeEvidence[] = [];
  
    for (const evidence of uniqueEvidence.values()) {
      const filter: RetrievalFilter = {
        source: evidence.source,
        title: evidence.title,
        section: evidence.section,
        chunkIndex: evidence.chunkIndex,
      };
  
      try {
        const chunks = await retrieve(
          query,
          5,
          -1,
          filter,
          query,
        );
  
        // 4. 只接受元数据完全匹配的 Chunk
        const exactChunk = chunks.find(
          (chunk) =>
            chunk.source === evidence.source &&
            chunk.title === evidence.title &&
            chunk.section === evidence.section &&
            chunk.chunkIndex === evidence.chunkIndex,
        );
  
        if (!exactChunk) {
          unresolvedEvidence.push(evidence);
          continue;
        }
  
        const key = getEvidenceKey(exactChunk);
  
        chunksByKey.set(key, exactChunk);
      } catch (error) {
        console.error(
          "[Graph Retrieval] Evidence retrieval failed:",
          {
            evidence,
            error,
          },
        );
  
        unresolvedEvidence.push(evidence);
      }
    }
  
    return {
      ...graphResult,
  
      // 从 Qdrant 实际找回的 Chunk
      chunks: [...chunksByKey.values()],
  
      // 元数据存在于图谱，但没找到对应 Chunk 的 Evidence
      unresolvedEvidence,
    };
  }

  function getEvidenceKey(item: {
    source: string;
    title: string;
    section: string;
    chunkIndex: number;
  }): string {
    return JSON.stringify([
      item.source.trim(),
      item.title.trim(),
      item.section.trim(),
      item.chunkIndex,
    ]);
  }
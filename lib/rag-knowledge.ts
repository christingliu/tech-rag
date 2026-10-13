
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
import type {
  KnowledgeNode,
  KnowledgeEvidence,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeRetrievalResult,
} from "./knowledge-type";

export type {
  KnowledgeNode,
  KnowledgeEvidence,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeRetrievalResult,
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
  
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const evidenceIds = new Set<string>();
  
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`重复节点 ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }
  
    for (const item of graph.evidence) {
      if (evidenceIds.has(item.id)) {
        errors.push(`重复 Evidence ID: ${item.id}`);
      }
      evidenceIds.add(item.id);
    }
  
    for (const edge of graph.edges) {
      if (edgeIds.has(edge.id)) {
        errors.push(`重复边 ID: ${edge.id}`);
      }
      edgeIds.add(edge.id);
  
      if (!nodeIds.has(edge.sourceId)) {
        errors.push(
          `边 ${edge.id} 引用了不存在的 source 节点: ${edge.sourceId}`,
        );
      }
  
      if (!nodeIds.has(edge.targetId)) {
        errors.push(
          `边 ${edge.id} 引用了不存在的 target 节点: ${edge.targetId}`,
        );
      }
  
      for (const evidenceId of edge.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(
            `边 ${edge.id} 引用了不存在的 Evidence: ${evidenceId}`,
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
  ): KnowledgeRetrievalResult {
    if (!Number.isInteger(maxHops) || maxHops < 0) {
      throw new Error("maxHops 必须是非负整数");
    }
  
    const validationErrors = validateKnowledgeGraph(graph);
  
    if (validationErrors.length > 0) {
      throw new Error(
        `KnowledgeGraph 校验失败:\n${validationErrors.join("\n")}`,
      );
    }
  
    const matchedNodes = findGraphNodes(graph, query);
  
    const nodeById = new Map(
      graph.nodes.map((node) => [node.id, node]),
    );
  
    const visitedNodeIds = new Set(
      matchedNodes.map((node) => node.id),
    );
  
    let frontier = new Set(
      matchedNodes.map((node) => node.id),
    );
  
    const selectedEdges = new Map<string, KnowledgeEdge>();
  
    console.log(frontier,'frontier');
    for (let hop = 0; hop < maxHops; hop++) {
      const nextFrontier = new Set<string>();
  
      for (const edge of graph.edges) {
        console.log(edge,'edge');
        const sourceMatched = frontier.has(edge.sourceId);
        const targetMatched = frontier.has(edge.targetId);
  
        if (!sourceMatched && !targetMatched) {
          continue;
        }
  
        selectedEdges.set(edge.id, edge);
  
        const neighborId = sourceMatched
          ? edge.targetId
          : edge.sourceId;
  
        if (!visitedNodeIds.has(neighborId)) {
          visitedNodeIds.add(neighborId);
          nextFrontier.add(neighborId);
        }
      }
  
      frontier = nextFrontier;
  
      if (frontier.size === 0) {
        break;
      }
    }
  
    const expandedNodes = [...visitedNodeIds]
      .map((id) => nodeById.get(id))
      .filter((node): node is KnowledgeNode => node !== undefined);
  
    const edges = [...selectedEdges.values()];
  
    const evidenceById = new Map(
      graph.evidence.map((item) => [item.id, item]),
    );
  
    const evidenceIds = new Set(
      edges.flatMap((edge) => edge.evidenceIds),
    );
  
    console.log(evidenceIds,'evidenceIds');
    const evidence = [...evidenceIds]
      .map((id) => evidenceById.get(id))
      .filter(
        (item): item is KnowledgeEvidence => item !== undefined,
      );
  
    return {
      query,
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
      const key =
        `${evidence.source}:${evidence.chunkIndex}`;
  
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
  
        const key =
          `${exactChunk.source}:${exactChunk.chunkIndex}`;
  
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

/**
 * V8.4.3 — Graph Context Builder
 *
 * 将图检索结果转换为可注入 RAG Prompt 的结构化上下文。
 * 不负责图遍历、实体解析、向量检索或 LLM 调用。
 */

export interface GraphContextNode {
    id: string;
    name: string;
    type?: string;
    description?: string;
  }
  
  export interface GraphContextEdge {
    id: string;
    sourceId: string;
    targetId: string;
    relation: string;
    evidenceIds?: string[];
  }
  
  export interface GraphContextPath {
    nodeIds: string[];
    edgeIds: string[];
    relations: string[];
  }
  
  export interface GraphContextEvidence {
    id: string;
    text: string;
    source?: string;
    title?: string;
    section?: string;
  }
  
  export interface GraphContextInput {
    query: string;
    nodes: GraphContextNode[];
    edges: GraphContextEdge[];
    paths?: GraphContextPath[];
    evidence?: GraphContextEvidence[];
  }
  
  export interface GraphContextOptions {
    /** 输出上下文的最大字符数，默认 6000 */
    maxChars?: number;
    /** 是否输出节点描述，默认 true */
    includeDescriptions?: boolean;
    /** 是否输出关系三元组，默认 true */
    includeRelations?: boolean;
    /** 是否输出多跳路径，默认 true */
    includePaths?: boolean;
    /** 是否输出证据正文，默认 true */
    includeEvidence?: boolean;
  }
  
  export interface GraphContextResult {
    text: string;
    charCount: number;
    truncated: boolean;
    includedNodeIds: string[];
    includedEdgeIds: string[];
    includedEvidenceIds: string[];
  }
  
  const compareString = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  
  function cleanText(value: string | undefined): string {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }
  
  /**
   * 依据检索结果构建确定性的图谱上下文。
   *
   * 预算策略：
   * 1. 查询
   * 2. 节点信息
   * 3. 多跳路径
   * 4. 关系
   * 5. 证据
   *
   * 每个完整条目独立计入预算；不会将一个条目静默截成半句。
   */
  export function buildGraphContext(
    input: GraphContextInput,
    options: GraphContextOptions = {},
  ): GraphContextResult {
    const {
      maxChars = 6000,
      includeDescriptions = true,
      includeRelations = true,
      includePaths = true,
      includeEvidence = true,
    } = options;
  
    if (!Number.isInteger(maxChars) || maxChars < 1) {
      throw new Error("maxChars 必须是正整数");
    }
  
    const nodeById = new Map<string, GraphContextNode>();
    for (const node of input.nodes) {
      if (!node.id || !node.name.trim()) {
        throw new Error("节点 id 和 name 不能为空");
      }
      if (nodeById.has(node.id)) {
        throw new Error(`存在重复节点 ID: ${node.id}`);
      }
      nodeById.set(node.id, node);
    }
  
    const edgeById = new Map<string, GraphContextEdge>();
    for (const edge of input.edges) {
      if (!edge.id || !edge.relation.trim()) {
        throw new Error("边 id 和 relation 不能为空");
      }
      if (edgeById.has(edge.id)) {
        throw new Error(`存在重复边 ID: ${edge.id}`);
      }
      edgeById.set(edge.id, edge);
    }
  
    const evidenceById = new Map<string, GraphContextEvidence>();
    for (const item of input.evidence ?? []) {
      if (!item.id) {
        throw new Error("证据 id 不能为空");
      }
      if (evidenceById.has(item.id)) {
        throw new Error(`存在重复证据 ID: ${item.id}`);
      }
      evidenceById.set(item.id, item);
    }
  
    const lines: string[] = [];
    const includedNodeIds = new Set<string>();
    const includedEdgeIds = new Set<string>();
    const includedEvidenceIds = new Set<string>();
    let charCount = 0;
    let truncated = false;
  
    // 预算包含换行符，避免最终文本超过 maxChars。
    const addLine = (line: string): boolean => {
        console.log(line,'addline');
      if (!line) return true;
       console.log(lines,'lines');
      const extraLength = line.length + (lines.length > 0 ? 1 : 0);
      if (charCount + extraLength > maxChars) {
        truncated = true;
        return false;
      }
  
      lines.push(line);
      charCount += extraLength;
      return true;
    };
  
    const query = cleanText(input.query);
    if (query && !addLine(`查询：${query}`)) {
      return {
        text: "",
        charCount: 0,
        truncated: true,
        includedNodeIds: [],
        includedEdgeIds: [],
        includedEvidenceIds: [],
      };
    }
  
    const sortedNodes = [...input.nodes].sort((a, b) =>
      compareString(a.id, b.id),
    );
  
    const formatNode = (node: GraphContextNode): string => {
      const description =
        includeDescriptions && cleanText(node.description)
          ? `：${cleanText(node.description)}`
          : "";
      const type = node.type ? `（${cleanText(node.type)}）` : "";
      return `- ${node.name}${type} [node:${node.id}]${description}`;
    };
  
    // 节点先排序，确保相同输入生成稳定输出。
    if (sortedNodes.length > 0) {
      if (!addLine("实体：")) {
        return finish();
      }
  
      for (const node of sortedNodes) {
        if (!addLine(formatNode(node))) break;
        includedNodeIds.add(node.id);
      }
    }
  
    const sortedPaths = [...(input.paths ?? [])].sort((a, b) =>
      compareString(a.nodeIds.join("\u0000"), b.nodeIds.join("\u0000")) ||
      compareString(a.edgeIds.join("\u0000"), b.edgeIds.join("\u0000")),
    );
  
    if (includePaths && sortedPaths.length > 0) {
      if (!addLine("关系路径：")) return finish();
  
      for (const path of sortedPaths) {
        if (path.nodeIds.length === 0) continue;
  
        const names = path.nodeIds.map((id) => {
          const node = nodeById.get(id);
          return node ? node.name : `[node:${id}]`;
        });
  
        const segments: string[] = [];
        for (let i = 0; i < names.length; i++) {
          segments.push(names[i]);
  
          if (i < path.relations.length) {
            segments.push(` --${path.relations[i]}--> `);
          }
        }
  
        const pathLine = `- ${segments.join("")}`;
        if (!addLine(pathLine)) break;
  
        for (const id of path.nodeIds) {
          if (nodeById.has(id)) includedNodeIds.add(id);
        }
        for (const id of path.edgeIds) {
          if (edgeById.has(id)) includedEdgeIds.add(id);
        }
      }
    }
  
    const sortedEdges = [...input.edges].sort((a, b) =>
      compareString(a.relation, b.relation) ||
      compareString(a.sourceId, b.sourceId) ||
      compareString(a.targetId, b.targetId) ||
      compareString(a.id, b.id),
    );
  
    if (includeRelations && sortedEdges.length > 0) {
      if (!addLine("关系事实：")) return finish();
  
      for (const edge of sortedEdges) {
        const source = nodeById.get(edge.sourceId);
        const target = nodeById.get(edge.targetId);
  
        const sourceName = source?.name ?? `[node:${edge.sourceId}]`;
        const targetName = target?.name ?? `[node:${edge.targetId}]`;
  
        const line =
          `- ${sourceName} --${edge.relation}--> ${targetName}` +
          ` [edge:${edge.id}]`;
  
        if (!addLine(line)) break;
  
        includedEdgeIds.add(edge.id);
        if (source) includedNodeIds.add(source.id);
        if (target) includedNodeIds.add(target.id);
      }
    }
  
    const sortedEvidence = [...(input.evidence ?? [])].sort((a, b) =>
      compareString(a.source ?? "", b.source ?? "") ||
      compareString(a.title ?? "", b.title ?? "") ||
      compareString(a.section ?? "", b.section ?? "") ||
      compareString(a.id, b.id),
    );
  
    if (includeEvidence && sortedEvidence.length > 0) {
      if (!addLine("证据：")) return finish();
  
      // 只纳入与已输出关系相关的证据，避免无关文本占用预算。
      const relevantEvidenceIds = new Set(
        sortedEdges
          .filter((edge) => includedEdgeIds.has(edge.id))
          .flatMap((edge) => edge.evidenceIds ?? []),
      );
  
      for (const item of sortedEvidence) {
        if (!relevantEvidenceIds.has(item.id)) continue;
  
        const text = cleanText(item.text);
        if (!text) continue;
  
        const metadata = [
          item.source,
          item.title,
          item.section,
        ]
          .map(cleanText)
          .filter(Boolean)
          .join(" / ");
  
        const line =
          `- [evidence:${item.id}]` +
          (metadata ? ` ${metadata}` : "") +
          `：${text}`;
  
        if (!addLine(line)) break;
        includedEvidenceIds.add(item.id);
      }
    }
  
    return finish();
  
    function finish(): GraphContextResult {
      return {
        text: lines.join("\n"),
        charCount,
        truncated,
        includedNodeIds: [...includedNodeIds].sort(compareString),
        includedEdgeIds: [...includedEdgeIds].sort(compareString),
        includedEvidenceIds: [...includedEvidenceIds].sort(compareString),
      };
    }
  }
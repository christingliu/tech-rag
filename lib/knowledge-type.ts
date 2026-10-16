export interface KnowledgeNode {
  id: string;
  name: string;
  type: "technology" | "api" | "concept";
  aliases: string[];
  description?: string;
}

export interface KnowledgeEvidence {
  id: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  evidenceIds: string[];
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  evidence: KnowledgeEvidence[];
}

export interface KnowledgeRetrievalResult {
  query: string;
  status: KnowledgeRetrievalStatus;
  matchedNodes: KnowledgeNode[];
  expandedNodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  evidence: KnowledgeEvidence[];
}

export type KnowledgeRetrievalStatus =
  | "no_match"
  | "ambiguous"
  | "resolved";

export interface GraphTraversalOptions {
  allowedRelations?: string[];
  direction?: "outgoing" | "incoming" | "both";
  maxNodes?: number;
  /** 按数组中的先后顺序决定关系优先级 */
  relationPriority?: string[];
}

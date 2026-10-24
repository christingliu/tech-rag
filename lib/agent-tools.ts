
import { retrieve } from "./rag";
import { keywordSearch } from "./keyword";
import {
  getDemoGraphStructure,
  getDemoGraph,
  retrieveKnowledgeEvidence,
} from "./rag-knowledge";

import type {
  AgentTool,
  AgentToolName,
} from "./agent-controller";

import {
  buildAliasIndex,
  matchEntity,
  resolveEntityWithContext,
} from "./entity";

import type { KnowledgeGraph } from "./knowledge-type";

function readEntity(input: Record<string, unknown>): string {
  const entity = input.entity;

  if (
    typeof entity !== "string" ||
    !entity.trim() ||
    entity.length > 200
  ) {
    throw new Error("INVALID_ENTITY");
  }

  return entity.trim();
}

function readContext(input: Record<string, unknown>): string {
  const context = input.context;

  if (
    typeof context !== "string" ||
    context.length > 1000
  ) {
    throw new Error("INVALID_ENTITY_CONTEXT");
  }

  return context.trim();
}

function readQuery(input: Record<string, unknown>): string {
  const query = input.query;

  if (
    typeof query !== "string" ||
    !query.trim() ||
    query.length > 1000
  ) {
    throw new Error("INVALID_QUERY");
  }

  return query.trim();
}

function readInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }

  return value as number;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown tool execution error";
}

function createTool(
  toolName: AgentToolName,
  search: (
    input: Record<string, unknown>,
  ) => Promise<{ data: unknown; resultCount: number }>,
): AgentTool {
  return {
    async execute(input) {
      try {
        const result = await search(input);

        return {
          ok: true,
          data: result.data,
          metadata: {
            resultCount: result.resultCount,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: `${toolName.toUpperCase()}_FAILED`,
            message: toErrorMessage(error),
          },
        };
      }
    },
  };
}

export function createAgentTools(): Partial<
  Record<AgentToolName, AgentTool>
> {
  return {
    vector_search: createTool(
      "vector_search",
      async (input) => {
        const query = readQuery(input);
        const limit = readInteger(
          input.limit,
          "limit",
          1,
          10,
        );

        const data = await retrieve(
          query,
          limit,
          0.3,
        );

        return {
          data,
          resultCount: data.length,
        };
      },
    ),

    keyword_search: createTool(
      "keyword_search",
      async (input) => {
        const query = readQuery(input);
        const limit = readInteger(
          input.limit,
          "limit",
          1,
          10,
        );

        const data = await keywordSearch(
          query,
          limit,
        );

        return {
          data,
          resultCount: data.length,
        };
      },
    ),

    graph_search: createTool(
      "graph_search",
      async (input) => {
        const query = readQuery(input);
        const maxHops = readInteger(
          input.maxHops,
          "maxHops",
          0,
          2,
        );

        const graph = await getDemoGraph();

        const data = await retrieveKnowledgeEvidence(
          graph,
          query,
          maxHops,
        );

        return {
          data,
          resultCount: data.chunks.length,
        };
      },
    ),

    entity_lookup: createTool(
      "entity_lookup",
      async (input) => {
        const entity = readEntity(input);
        const context = readContext(input);
    
        // 只获取节点和边，不加载真实 Evidence。
        const structure = getDemoGraphStructure();
    
        // entity.ts 的匹配函数使用自己的轻量节点类型。
        const aliasIndex = buildAliasIndex(
          structure.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            aliases: node.aliases,
          })),
        );
    
        // 第一步：精确匹配规范名称或别名。
        const match = matchEntity(entity, aliasIndex);
    
        const candidates = structure.nodes
          .filter((node) => match.candidateIds.includes(node.id))
          .map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            aliases: node.aliases,
            description: node.description,
          }));
    
        if (candidates.length === 0) {
          return {
            data: {
              status: "no_match",
              entity,
              candidateIds: [],
              candidates: [],
              resolution: null,
            },
            resultCount: 0,
          };
        }
    
        // 第二步：用完整上下文辅助消歧。
        // 没有上下文时不凭空推断，使用实体名称本身。
        const graph: KnowledgeGraph = {
          ...structure,
          evidence: [],
        };
    
        const resolution = resolveEntityWithContext(
          context || entity,
          match.candidateIds,
          graph,
        );
    
        const status =
          resolution.selectedId !== null
            ? "resolved"
            : "ambiguous";
    
        return {
          data: {
            status,
            entity,
            candidateIds: match.candidateIds,
            candidates,
            resolution,
          },
          resultCount: candidates.length,
        };
      },
    ),
  };
}
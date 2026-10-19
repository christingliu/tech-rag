
import { retrieve } from "./rag";
import { keywordSearch } from "./keyword";
import {
  getDemoGraph,
  retrieveKnowledgeEvidence,
} from "./rag-knowledge";

import type {
  AgentTool,
  AgentToolName,
} from "./agent-controller";

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
  };
}
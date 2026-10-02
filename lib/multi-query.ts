import { openai } from "./openai";
import { RagError } from "./error";
import type { HybridResult } from "./hybrid";

export interface MultiQueryResult {
  originalQuery: string;
  queries: string[];
}

export async function generateMultiQueries(
  query: string,
  count = 3
): Promise<string[]> {
  const prompt = `
你是一个 RAG Retrieval Query Generator。

请根据用户的检索问题，生成 ${count} 个
语义相关但表达角度不同的检索查询。

要求：

1. 保留用户问题的核心意图。
2. 使用明确的技术术语。
3. 每个查询应该从不同角度表达相同的信息需求。
4. 不要回答问题。
5. 不要添加解释。
6. 只返回 JSON 数组。
7. 每个元素必须是字符串。
8. 不要生成重复查询。

用户问题：

${query}

返回格式：

[
  "query 1",
  "query 2",
  "query 3"
]
`;

  try {
    const response =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0,
      });

    const content =
      response.choices[0]?.message?.content
        ?.trim() ?? "[]";

    const queries =
      JSON.parse(content) as string[];

    if (!Array.isArray(queries)) {
      throw new Error(
        "Multi-query response must be an array"
      );
    }

    const validQueries =
      queries.filter(
        (item): item is string =>
          typeof item === "string" &&
          item.trim().length > 0
      );

    return [
      query,
      ...validQueries
        .filter(
          (item) =>
            item.trim() !== query.trim()
        )
        .slice(0, count - 1),
    ];
  } catch (error) {
    throw new RagError(
      "multi-query",
      "Failed to generate multi queries",
      error
    );
  }
}

export function mergeMultiQueryResults(
  resultSets: HybridResult[][]
): HybridResult[] {
  const documents = new Map<
    string,
    HybridResult
  >();

  for (const results of resultSets) {
    for (const document of results) {
      const key =
        `${document.source}:${document.chunkIndex}`;

      const existing =
        documents.get(key);

      if (existing) {
        existing.rrfScore +=
          document.rrfScore;
      } else {
        documents.set(key, {
          ...document,
        });
      }
    }
  }

  return Array.from(
    documents.values()
  ).sort(
    (a, b) =>
      b.rrfScore -
      a.rrfScore
  );
}
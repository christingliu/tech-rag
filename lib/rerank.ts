import { openai } from "./openai";

export interface RerankDocument {
  content: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
  rrfScore: number;
}

export interface RerankResult
  extends RerankDocument {
  rerankScore: number | null;
  parentId: string;
  parentContent: string;
}

export async function rerank(
  query: string,
  documents: RerankDocument[],
  topN = 3
): Promise<RerankResult[]> {
  if (documents.length === 0) {
    return [];
  }

  if (documents.length <= topN) {
    return documents.map((doc) => ({
      ...doc,
      rerankScore: null,
      parentId: "",
      parentContent: "",
    }));
  }

  const documentText = documents
    .map((doc, index) => {
          return `
    [Document ${index}]

    Source: ${doc.source}
    Title: ${doc.title}
    Section: ${doc.section}

    Content:
    ${doc.content}
    `;
    })
    .join("\n\n");

  const prompt = `
你是一个 RAG Retrieval Reranker。

你的任务是根据用户问题，判断候选文档与问题的相关程度。

用户问题：

${query}

候选文档：

${documentText}

请按照与用户问题的相关程度，从高到低排序。

只返回 JSON 数组，不要返回 Markdown，不要添加任何解释。

JSON 格式：

[
  {
    "index": 0,
    "rerankScore": 0.95
  },
  {
    "index": 2,
    "rerankScore": 0.72
  }
]

要求：

1. index 必须是候选文档的 index。
2. rerankScore 范围必须是 0 到 1。
3. rerankScore 越高表示与用户问题越相关。
4. 只返回最相关的 ${topN} 个文档。
`;

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
    response.choices[0]?.message?.content ?? "[]";

  try {
    const rankings = JSON.parse(content) as {
      index: number;
      rerankScore: number;
    }[];

    return rankings
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .map((item) => {
        const document = documents[item.index];

        if (!document) {
          return null;
        }

        return {
          ...document,
          rerankScore: item.rerankScore,
        };
      })
      .filter(
        (item): item is RerankResult & { rerankScore: number } =>
          item !== null
      );
  } catch (error) {
    console.error(
      "Rerank parsing failed:",
      error
    );

    return documents
      .slice(0, topN)
      .map((doc) => ({
        ...doc,
        rerankScore: null,
        parentId: "",
        parentContent: "",
      }));
  }
}
import { openai } from "./openai";
import { RagError } from "./error";

export async function generateHypotheticalDocument(
  query: string
): Promise<string> {
  const prompt = `
你是一个 RAG Retrieval Hypothetical Document Generator。

你的任务不是回答问题，
而是生成一段“可能存在于知识库中的技术文档片段”。

这段文本只用于向量检索。

要求：

1. 使用技术文档风格，而不是聊天回答。
2. 使用明确的技术术语。
3. 包含可能出现在真实文档中的关键词。
4. 描述相关概念、机制、原因或实现方式。
5. 不要写总结。
6. 不要写“答案是”。
7. 不要提及用户或用户问题。
8. 不要使用 Markdown 标题。
9. 长度控制在 150-300 个词以内。
10. 不要编造具体 API、版本号或不存在的技术事实。

技术领域：

React / Frontend Engineering

用户查询：

${query}

只返回文档内容。
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
      response.choices[0]?.message?.content?.trim() ?? "";

    if (!content) {
      throw new Error(
        "HyDE returned empty content"
      );
    }

    return content;
  } catch (error) {
    throw new RagError(
      "hyde",
      "Failed to generate hypothetical document",
      error
    );
  }
}
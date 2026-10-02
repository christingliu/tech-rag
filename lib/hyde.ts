import { openai } from "./openai";
import { RagError } from "./error";

export async function generateHypotheticalDocument(
  query: string
): Promise<string> {
  const prompt = `
你是一个 RAG Retrieval Hypothetical Document Generator。

请根据用户的问题，生成一段假想的技术文档内容。

这段内容不是最终回答，而是用于向量检索。

要求：

1. 围绕用户问题生成可能出现在知识库中的技术文档内容。
2. 使用明确的技术术语。
3. 包含与问题相关的核心概念。
4. 不要提及“用户”“问题”或“假想文档”。
5. 不要生成 Markdown 标题。
6. 不要添加解释。
7. 直接返回文档内容。

用户问题：

${query}
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
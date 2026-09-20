import { openai } from "./openai";

export async function rewriteQuery(
  query: string
) {
  const prompt = `
你是一个 RAG Query Rewriter。

请将用户的问题改写成适合知识库检索的查询。

要求：

1. 保留用户问题的核心含义。
2. 补充必要的上下文。
3. 使用明确的技术术语。
4. 不要回答问题。
5. 只返回改写后的查询。
6. 不要添加解释。

用户问题：

${query}
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

  return (
    response.choices[0]?.message?.content?.trim() ??
    query
  );
}
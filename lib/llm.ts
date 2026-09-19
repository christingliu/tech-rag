import OpenAI from "openai";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.ofox.ai/v1",
});

export async function generateAnswer(
  question: string,
  context: string
) {
  const prompt = `
你是一个个人技术知识库助手。

请严格根据下面提供的 Context 回答问题。

规则：
1. 只能使用 Context 中的信息。
2. 如果 Context 没有答案，请明确告诉用户知识库中没有找到相关信息。
3. 不要编造不存在的信息。
4. 回答尽量简洁、准确。
5. 回答最后列出参考来源。

Context:

${context}

Question:

${question}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return {
    answer:
      response.choices[0]?.message?.content ?? "",

    model: response.model,

    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens:
            response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : null,
  }
}
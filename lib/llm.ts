import { openai } from "./openai";
import {
  recordLlmCall,
  recordLlmFailure,
} from "./metrics";
import { error } from "console";
import { withTimeout } from "./timeout";

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
5. 如果一个结论来自某个 Source，请在对应句子后添加 [Source N]。
6. Source N 必须来自 Context 中实际存在的 Source。
7. 不要编造不存在的 Source。
8. 如果一个结论由多个 Source 支持，可以添加多个引用，例如 [Source 1][Source 2]。
9. 不要在回答最后重复完整的来源列表，来源由系统单独展示。

Context:

${context}

Question:

${question}
`;

 try{
  const response = await withTimeout(openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  }),1000);

  const usage =
  response.usage;

    if (usage) {
      recordLlmCall({
        promptTokens:
          usage.prompt_tokens ?? 0,

        completionTokens:
          usage.completion_tokens ?? 0,

        totalTokens:
          usage.total_tokens ?? 0,
      });
    }

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
 }catch(error){
  recordLlmFailure();
  throw error;
 } 
 
}

export async function generateAnswerStream(
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
5. 如果某个结论来自某个 Source，请在对应句子后添加 [Source N]。
6. Source N 必须来自 Context 中实际存在的 Source。
7. 不要编造不存在的 Source。
8. 回答最后不要重复列出完整来源，来源信息由系统单独展示。


Context:

${context}

Question:

${question}
`;

  try{
    const stream =
    await withTimeout(openai.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      stream: true,
    }),30000);

  return stream;
  }catch(error){
    recordLlmFailure();
  throw error;
  }
}

export async function generateDirectAnswerStream(
  question: string
) {
  const prompt = `
你是一个个人技术知识库助手。

当前问题不需要查询知识库，请直接回答用户问题。

规则：

1. 正常回答用户的问题。
2. 不需要引用任何 [Source N]。
3. 不要编造不存在的信息。
4. 如果你无法确定答案，请明确说明。
5. 回答尽量简洁、准确。

Question:

${question}
`;

  try {
    const stream =
      await withTimeout(
        openai.chat.completions.create({
          model: "gpt-4o-mini",

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          stream: true,
        }),
        30000
      );

    return stream;
  } catch (error) {
    recordLlmFailure();
    throw error;
  }
}
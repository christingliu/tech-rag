import { openai } from "./openai";
import {
  recordEmbeddingCall,
  recordEmbeddingFailure,
  recordEmbeddingUsage,
} from "./metrics";
import { withTimeout } from "./timeout";

export async function createEmbedding(
  text: string
) {
  recordEmbeddingCall();

  try {
    const response =
      await withTimeout(
        openai.embeddings.create({
          model:
            "text-embedding-3-small",
          input: text,
        }),
        10_000
      );

    recordEmbeddingUsage(
      response.usage?.prompt_tokens ?? 0
    );

    return response.data[0].embedding;
  } catch (error) {
    recordEmbeddingFailure();
    throw error;
  }
}
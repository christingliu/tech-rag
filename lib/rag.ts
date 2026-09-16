import { createEmbedding } from "./embedding";
import {
  qdrant,
  COLLECTION_NAME,
} from "./qdrant";
import { generateAnswer } from "./llm";

export async function retrieve(
  query: string,
  limit = 5
) {
  const vector = await createEmbedding(query);

  const result = await qdrant.search(
    COLLECTION_NAME,
    {
      vector,
      limit,
      with_payload: true,
    }
  );

  return result.map((item) => ({
    score: item.score,
    content: item.payload?.content as string,
    source: item.payload?.source as string,
    chunkIndex: item.payload?.chunkIndex as number,
  }));
}

export async function answerQuestion(
  question: string
) {
  const results = await retrieve(question);

  const context = results
    .map((item, index) => {
      return `
[Source ${index + 1}: ${item.source}]

${item.content}
`;
    })
    .join("\n\n");

  const answer = await generateAnswer(
    question,
    context
  );

  return {
    answer,
    sources: results.map((item) => ({
      source: item.source,
      score: item.score,
    })),
  };
}

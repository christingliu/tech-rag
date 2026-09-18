import { createEmbedding } from "./embedding";
import {
  qdrant,
  COLLECTION_NAME,
} from "./qdrant";
import { generateAnswer } from "./llm";
import { rerank } from "./rerank";

export async function retrieve(
  query: string,
  limit = 5,
  scoreThreshold = 0.3,
  debug = true
) {
  const vector = await createEmbedding(query);

  const result = await qdrant.search(
    COLLECTION_NAME,
    {
      vector,
      limit,
      with_payload: true
    }
  );

  const results = result
    .map((item) => ({
      score: item.score,
      content: item.payload?.content as string,
      source: item.payload?.source as string,
      title: item.payload?.title as string,
      section: item.payload?.section as string,
      chunkIndex: item.payload?.chunkIndex as number,
    }))
    .filter((item) => item.score >= scoreThreshold);

  if (debug) {
    console.log("\n========== Retrieval Debug ==========");
    console.log("Query:", query);
    console.log("Requested Top-K:", limit);
    console.log("Score Threshold:", scoreThreshold);
    console.log("Retrieved:", results.length);

    results.forEach((item, index) => {
      console.log(`\n--- Result ${index + 1} ---`);
      console.log("Score:", item.score);
      console.log("Source:", item.source);
      console.log("Title:", item.title);
      console.log("Section:", item.section);
      console.log("Chunk Index:", item.chunkIndex);
      console.log("Content:", item.content);
    });

    console.log("\n====================================\n");
  }

  return results;
}

export async function answerQuestion(
  question: string
) {
  const results = await retrieve(question);

 const context = results
  .map((item, index) => {
    return `
[Source ${index + 1}]
Source: ${item.source}
Title: ${item.title}
Section: ${item.section}

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
      title: item.title,
      section: item.section,
      score: item.score,
      chunkIndex: item.chunkIndex,
    })),
  };
}

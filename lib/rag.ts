import { createEmbedding } from "./embedding";

import {
  qdrant,
  COLLECTION_NAME,
} from "./qdrant";

import { generateAnswer } from "./llm";

import { rerank } from "./rerank";

import { rewriteQuery } from "./query";

import { keywordSearch } from "./keyword";

import {
  reciprocalRankFusion,
} from "./hybrid";

/* import {
  createTrace,
  printTrace,
} from "./trace"; */

export interface RetrievalFilter {
  title?: string | null;
  source?: string | null;
  section?: string | null;
}

export async function retrieve(
  query: string,
  limit = 10,
  scoreThreshold = 0.3,
  filter ?:RetrievalFilter
) {
  console.log(filter,'retrieve-filter')
  const vector = await createEmbedding(query);

  const result = await qdrant.search(
    COLLECTION_NAME,
    {
      vector,
      limit,
      with_payload: true,
      filter: filter
      ? {
          must: [
            ...(filter.source
              ? [
                  {
                    key: "source",
                    match: {
                      value: filter.source,
                    },
                  },
                ]
              : []),

            ...(filter.title
              ? [
                  {
                    key: "title",
                    match: {
                      value: filter.title,
                    },
                  },
                ]
              : []),

            ...(filter.section
              ? [
                  {
                    key: "section",
                    match: {
                      value: filter.section,
                    },
                  },
                ]
              : []),
          ],
        }
      : undefined
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
    .filter(
      (item) => item.score >= scoreThreshold
    );

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

  return results;
}

export async function answerQuestion(
  question: string,
  filter?: RetrievalFilter
) {
  // 1. Query Rewrite
  const rewrittenQuery =
    await rewriteQuery(question);

  console.log("\n========== Query Rewrite ==========");
  console.log("Original Query:", question);
  console.log("Rewritten Query:", rewrittenQuery);
  console.log("===================================\n");

  // 2. Vector Search
  const vectorResults =
    await retrieve(
      rewrittenQuery,
      10,
      0.3,
      filter
    );

  console.log("\n========== Vector Results ==========");
  console.log("Count:", vectorResults.length);
  vectorResults.forEach((item, index) => {
    console.log(
      `${index + 1}.`,
      item.score,
      item.title,
      item.section,
      item.source,
      `chunk ${item.chunkIndex}`
    );
  });
  console.log("====================================\n");

  /* // 3. 获取当前 filter 范围内的全部文档
  const allDocuments =
    await getAllDocuments(filter); */

  // 4. Keyword Search
  const keywordResults =
    await keywordSearch(
      rewrittenQuery,
      10,
      filter
    );

  console.log("\n========== Keyword Results ==========");
  console.log("Count:", keywordResults.length);
  keywordResults.forEach((item, index) => {
    console.log(
      `${index + 1}.`,
      item.keywordScore,
      item.title,
      item.section,
      item.source,
      `chunk ${item.chunkIndex}`
    );
  });
  console.log("=====================================\n");

  // 5. Hybrid Search / RRF
  const hybridResults =
    reciprocalRankFusion(
      vectorResults,
      keywordResults,
      10
    );

  console.log("\n========== Hybrid Results (RRF) ==========");
  console.log("Count:", hybridResults.length);
  hybridResults.forEach((item, index) => {
    console.log(
      `${index + 1}.`,
      item.rrfScore,
      item.title,
      item.section,
      item.source,
      `chunk ${item.chunkIndex}`
    );
  });
  console.log("==========================================\n");

  // 6. Rerank
  const rerankedResults =
    await rerank(
      rewrittenQuery,
      hybridResults,
      3
    );

  console.log("\n========== Reranked Results ==========");
  console.log("Count:", rerankedResults.length);
  rerankedResults.forEach((item, index) => {
    console.log(
      `${index + 1}.`,
      "rerank:",
      item.rerankScore,
      "rrf:",
      item.rrfScore,
      item.title,
      item.section,
      item.source,
      `chunk ${item.chunkIndex}`
    );
  });
  console.log("======================================\n");

  // 7. Context
  const context =
    rerankedResults
      .map(
        (item, index) => `
[Source ${index + 1}]
Source: ${item.source}
Title: ${item.title}
Section: ${item.section}

${item.content}
`
      )
      .join("\n\n");

  // 8. LLM
  const llmResult =
    await generateAnswer(
      question,
      context
    );

  return {
    answer: llmResult.answer,

    sources:
      rerankedResults.map(
        (item) => ({
          source: item.source,
          title: item.title,
          section: item.section,
          rrfScore: item.rrfScore,
          rerankScore:
            item.rerankScore,
        })
      ),

    debug: {
      rewrittenQuery,

      vectorResults:
        vectorResults.length,

      keywordResults:
        keywordResults.length,

      hybridResults:
        hybridResults.length,

      usage: llmResult.usage,
    },
  };
}
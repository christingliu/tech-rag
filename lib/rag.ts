import { createEmbedding } from "./embedding";

import {
  qdrant,
  COLLECTION_NAME,
} from "./qdrant";

import { generateAnswer } from "./llm";

import { rerank } from "./rerank";

import { rewriteQuery } from "./query";

import { keywordSearch } from "./keyword";

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
  // =========================
  // Query Rewrite
  // =========================

  const rewrittenQuery =
    await rewriteQuery(question);

  console.log(
    "\n========== Query Rewrite =========="
  );

  console.log(
    "Original Query:",
    question
  );

  console.log(
    "Rewritten Query:",
    rewrittenQuery
  );

  console.log(
    "===================================\n"
  );

  // =========================
  // Vector Search
  // =========================

  const vectorResults = await retrieve(
    rewrittenQuery,
    10,
    0.3,
    filter
  );

  // =========================
  // Keyword Search
  // =========================

  const keywordResults =
    await keywordSearch(
      rewrittenQuery,
      10,
      filter
    );

  console.log(
    "\n========== Retrieval Comparison =========="
  );

  console.log(
    "Vector Results:",
    vectorResults.length
  );

  vectorResults.forEach(
    (item, index) => {
      console.log(
        `Vector ${index + 1}:`,
        item.score,
        item.title,
        item.section
      );
    }
  );

  console.log(
    "\nKeyword Results:",
    keywordResults.length
  );

  keywordResults.forEach(
    (item, index) => {
      console.log(
        `Keyword ${index + 1}:`,
        item.keywordScore,
        item.title,
        item.section
      );
    }
  );

  console.log(
    "==========================================\n"
  );

  // =========================
  // Merge Candidates
  // =========================

  const candidates = [
    ...vectorResults,
    ...keywordResults.map((item) => ({
      ...item,
      score: item.keywordScore,
    })),
  ];

  // =========================
  // Remove Duplicates
  // =========================

  const uniqueCandidates =
    Array.from(
      new Map(
        candidates.map((item) => [
          `${item.source}:${item.chunkIndex}`,
          item,
        ])
      ).values()
    );

  console.log(
    "Vector candidates:",
    vectorResults.length
  );

  console.log(
    "Keyword candidates:",
    keywordResults.length
  );

  console.log(
    "Unique candidates:",
    uniqueCandidates.length
  );

  // =========================
  // Rerank
  // =========================

  const rerankedResults =
    await rerank(
      rewrittenQuery,
      uniqueCandidates,
      3
    );

  // =========================
  // Context
  // =========================

  const context =
    rerankedResults
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

  // =========================
  // LLM
  // =========================

  const llmResult =
    await generateAnswer(
      question,
      context
    );

  // =========================
  // Return
  // =========================

  return {
    answer: llmResult.answer,

    sources: rerankedResults.map(
      (item) => ({
        source: item.source,
        title: item.title,
        section: item.section,
        score: item.score,
        rerankScore:
          item.rerankScore,
        keywordScore:
          "keywordScore" in item
            ? item.keywordScore
            : undefined,
      })
    ),

    debug: {
      rewrittenQuery,

      vectorResults:
        vectorResults.length,

      keywordResults:
        keywordResults.length,

      uniqueCandidates:
        uniqueCandidates.length,

      usage: llmResult.usage,
    },
  };
}
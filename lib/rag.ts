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

import { RagError } from "./error";

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
  filter?: RetrievalFilter
) {
  console.log(
    filter,
    "retrieve-filter"
  );

  const vector =
    await createEmbedding(query);

  const result =
    await qdrant.search(
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
                          value:
                            filter.source,
                        },
                      },
                    ]
                  : []),

                ...(filter.title
                  ? [
                      {
                        key: "title",
                        match: {
                          value:
                            filter.title,
                        },
                      },
                    ]
                  : []),

                ...(filter.section
                  ? [
                      {
                        key: "section",
                        match: {
                          value:
                            filter.section,
                        },
                      },
                    ]
                  : []),
              ],
            }
          : undefined,
      }
    );

  const results = result
    .map((item) => ({
      score: item.score,

      content:
        item.payload?.content as string,

      source:
        item.payload?.source as string,

      title:
        item.payload?.title as string,

      section:
        item.payload?.section as string,

      chunkIndex:
        item.payload?.chunkIndex as number,
    }))
    .filter(
      (item) =>
        item.score >= scoreThreshold
    );

  console.log(
    "\n========== Retrieval Debug =========="
  );

  console.log("Query:", query);
  console.log(
    "Requested Top-K:",
    limit
  );
  console.log(
    "Score Threshold:",
    scoreThreshold
  );
  console.log(
    "Retrieved:",
    results.length
  );

  results.forEach((item, index) => {
    console.log(
      `\n--- Result ${index + 1} ---`
    );

    console.log(
      "Score:",
      item.score
    );

    console.log(
      "Source:",
      item.source
    );

    console.log(
      "Title:",
      item.title
    );

    console.log(
      "Section:",
      item.section
    );

    console.log(
      "Chunk Index:",
      item.chunkIndex
    );

    console.log(
      "Content:",
      item.content
    );
  });

  console.log(
    "\n====================================\n"
  );

  return results;
}

export async function answerQuestion(
  question: string,
  filter?: RetrievalFilter
) {
  // ========================================
  // 1. Query Rewrite
  // ========================================

  let rewrittenQuery =
    question;

  let queryRewriteFallback =
    false;

  try {
    rewrittenQuery =
      await rewriteQuery(
        question
      );

    console.log(
      "[RAG] Query rewrite succeeded"
    );
  } catch (error) {
    queryRewriteFallback =
      true;

    console.error(
      "[RAG] Query rewrite failed:",
      error
    );

    // FALLBACK
    // 使用原始问题继续检索
    rewrittenQuery =
      question;

    console.log(
      "[RAG] Fallback → original query"
    );
  }

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
    "Fallback:",
    queryRewriteFallback
  );

  console.log(
    "===================================\n"
  );

  // ========================================
  // 2. Vector Search
  // ========================================

  let vectorResults:
    Awaited<
      ReturnType<typeof retrieve>
    > = [];

  let vectorSearchFailed =
    false;

  try {
    vectorResults =
      await retrieve(
        rewrittenQuery,
        10,
        0.3,
        filter
      );

    console.log(
      "[RAG] Vector search succeeded"
    );
  } catch (error) {
    vectorSearchFailed =
      true;

    console.error(
      "[RAG] Vector search failed:",
      error
    );

    console.log(
      "[RAG] Vector search unavailable"
    );
  }

  console.log(
    "\n========== Vector Results =========="
  );

  console.log(
    "Count:",
    vectorResults.length
  );

  vectorResults.forEach(
    (item, index) => {
      console.log(
        `${index + 1}.`,
        item.score,
        item.title,
        item.section,
        item.source,
        `chunk ${item.chunkIndex}`
      );
    }
  );

  console.log(
    "====================================\n"
  );

  // ========================================
  // 3. Keyword Search
  // ========================================

  let keywordResults:
    Awaited<
      ReturnType<typeof keywordSearch>
    > = [];

  let keywordSearchFailed =
    false;

  try {
    keywordResults =
      await keywordSearch(
        rewrittenQuery,
        10,
        filter
      );

    console.log(
      "[RAG] Keyword search succeeded"
    );
  } catch (error) {
    keywordSearchFailed =
      true;

    console.error(
      "[RAG] Keyword search failed:",
      error
    );

    console.log(
      "[RAG] Keyword search unavailable"
    );
  }

  console.log(
    "\n========== Keyword Results =========="
  );

  console.log(
    "Count:",
    keywordResults.length
  );

  keywordResults.forEach(
    (item, index) => {
      console.log(
        `${index + 1}.`,
        item.keywordScore,
        item.title,
        item.section,
        item.source,
        `chunk ${item.chunkIndex}`
      );
    }
  );

  console.log(
    "=====================================\n"
  );

  // ========================================
  // 4. Retrieval Fail Fast
  // ========================================

  if (
    vectorSearchFailed &&
    keywordSearchFailed
  ) {
    throw new RagError(
      "hybrid",
      "Both vector search and keyword search failed"
    );
  }

  // ========================================
  // 5. Hybrid Search / RRF
  // ========================================

  let hybridResults;

  try {
    hybridResults =
      reciprocalRankFusion(
        vectorResults,
        keywordResults,
        10
      );

    console.log(
      "[RAG] Hybrid search succeeded"
    );
  } catch (error) {
    console.error(
      "[RAG] Hybrid search failed:",
      error
    );

    // FAIL FAST
    throw new RagError(
      "hybrid",
      "Hybrid search failed",
      error
    );
  }

  console.log(
    "\n========== Hybrid Results (RRF) =========="
  );

  console.log(
    "Count:",
    hybridResults.length
  );

  hybridResults.forEach(
    (item, index) => {
      console.log(
        `${index + 1}.`,
        item.rrfScore,
        item.title,
        item.section,
        item.source,
        `chunk ${item.chunkIndex}`
      );
    }
  );

  console.log(
    "==========================================\n"
  );

  // ========================================
  // 6. No Retrieval Result
  // ========================================

  if (
    hybridResults.length === 0
  ) {
    return {
      answer:
        "知识库中没有找到与该问题相关的信息。",

      sources: [],

      debug: {
        rewrittenQuery,

        queryRewriteFallback,

        vectorResults:
          vectorResults.length,

        keywordResults:
          keywordResults.length,

        hybridResults: 0,

        vectorSearchFailed,

        keywordSearchFailed,

        rerankFallback: false,

        usage: undefined,
      },
    };
  }

  // ========================================
  // 7. Rerank
  // ========================================

  let rerankedResults;

  let rerankFallback =
    false;

  try {
    rerankedResults =
      await rerank(
        rewrittenQuery,
        hybridResults,
        3
      );

    console.log(
      "[RAG] Rerank succeeded"
    );
  } catch (error) {
    rerankFallback =
      true;

    console.error(
      "[RAG] Rerank failed:",
      error
    );

    // FALLBACK
    // Rerank 只是增强能力
    // 失败后继续使用 Hybrid Results
    console.log(
      "[RAG] Fallback → hybrid results"
    );

    rerankedResults =
      hybridResults
        .slice(0, 3)
        .map((item) => ({
          ...item,
          rerankScore:
            null,
        }));
  }

  console.log(
    "\n========== Reranked Results =========="
  );

  console.log(
    "Count:",
    rerankedResults.length
  );

  rerankedResults.forEach(
    (item, index) => {
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
    }
  );

  console.log(
    "======================================\n"
  );

  // ========================================
  // 8. Context
  // ========================================

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

  // ========================================
  // 9. LLM
  // ========================================

  let llmResult;

  try {
    llmResult =
      await generateAnswer(
        question,
        context
      );

    console.log(
      "[RAG] LLM generation succeeded"
    );
  } catch (error) {
    console.error(
      "[RAG] LLM generation failed:",
      error
    );

    // FAIL FAST
    throw new RagError(
      "llm",
      "Answer generation failed",
      error
    );
  }

  // ========================================
  // 10. Final Response
  // ========================================

  return {
    answer:
      llmResult.answer,

    sources:
      rerankedResults.map(
        (item) => ({
          source:
            item.source,

          title:
            item.title,

          section:
            item.section,

          rrfScore:
            item.rrfScore,

          rerankScore:
            item.rerankScore,
        })
      ),

    debug: {
      rewrittenQuery,

      queryRewriteFallback,

      vectorResults:
        vectorResults.length,

      keywordResults:
        keywordResults.length,

      hybridResults:
        hybridResults.length,

      vectorSearchFailed,

      keywordSearchFailed,

      rerankFallback,

      usage:
        llmResult.usage,
    },
  };
}
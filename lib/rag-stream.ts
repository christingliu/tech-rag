import { retrieve } from "./rag";

import {
  keywordSearch,
} from "./keyword";

import {
  reciprocalRankFusion,
} from "./hybrid";

import {
  rerank,
} from "./rerank";

import {
  rewriteQuery,
} from "./query";

import {
  generateAnswerStream,
} from "./llm";

import {
  RagError,
} from "./error";

import type {
  RetrievalFilter,
} from "./rag";

import type {
  CitationSource,
} from "./citation";

import {
  validateCitations,
} from "./citation";

import {
  getCache,
  setCache,
} from "./cache";

import {
  createCacheKey,
} from "./cache-key";

import {
  createRagTrace,
  finishRagTrace,
  startStageTimer,
} from "./trace";

import type {
  RagTrace,
} from "./trace";

import {
  generateMultiQueries,
  mergeMultiQueryResults,
} from "./multi-query";

export async function prepareRagContext(
  question: string,
  filter?: RetrievalFilter,
  trace?: RagTrace
) {
  // =================================================
  // 1. Query Rewrite
  // =================================================

  let rewrittenQuery = question;

  let queryRewriteFallback = false;

  const rewriteTimer =
    startStageTimer();

  try {
    rewrittenQuery =
      await rewriteQuery(question);

    const latencyMs =
      rewriteTimer.end();

    if (trace) {
      trace.rewrite = {
        latencyMs,
        fallback: false,
      };
    }

    console.log(
      "[RAG Stage] Query Rewrite:",
      latencyMs,
      "ms"
    );
  } catch (error) {
    const latencyMs =
      rewriteTimer.end();

    console.error(
      "[RAG Stage] Query Rewrite failed:",
      {
        latencyMs,
        error,
      }
    );

    queryRewriteFallback = true;

    rewrittenQuery = question;

    if (trace) {
      trace.rewrite = {
        latencyMs,
        fallback: true,
      };
    }
  }

    //=================================================
    // multi query generation
    // =================================================
    // 2. Multi Query
    // =================================================

    let multiQueries: string[] = [
      rewrittenQuery,
    ];

    let multiQueryFallback = false;

    const multiQueryTimer =
      startStageTimer();

    try {
      const generatedQueries =
        await generateMultiQueries(
          rewrittenQuery,
          3
        );

      if (
        Array.isArray(generatedQueries) &&
        generatedQueries.length > 0
      ) {
        multiQueries =
          generatedQueries;
      } else {
        multiQueryFallback = true;
      }

      const latencyMs =
        multiQueryTimer.end();

      console.log(
        "[RAG Stage] Multi Query:",
        {
          latencyMs,
          queries: multiQueries,
          fallback:
            multiQueryFallback,
        }
      );

      if (trace) {
        trace.multiQuery = {
          count:
            multiQueries.length,
          latencyMs,
          fallback:
            multiQueryFallback,
        };
      }
    } catch (error) {
      const latencyMs =
        multiQueryTimer.end();

      console.error(
        "[RAG Stage] Multi Query failed:",
        {
          latencyMs,
          error,
        }
      );

      multiQueries = [
        rewrittenQuery,
      ];

      multiQueryFallback = true;

      if (trace) {
        trace.multiQuery = {
          count: 1,
          latencyMs,
          fallback: true,
        };
      }
    }


  // =================================================
  // 3. Multi Query Retrieval
  //
  // 一个 Query 内完成：
  //
  // Vector Search
  //      +
  // Keyword Search
  //      ↓
  // RRF
  //
  // 然后进入下一个 Query
  // =================================================

  const retrievalTimer =
    startStageTimer();

  const retrievalResults: Array<
    Awaited<
      ReturnType<
        typeof reciprocalRankFusion
      >
    >
  > = [];

  let vectorSuccessCount = 0;
  let vectorFailureCount = 0;

  let keywordSuccessCount = 0;
  let keywordFailureCount = 0;

  for (const query of multiQueries) {
    console.log(
      "\n[RAG Stage] Processing Query:",
      query
    );

    let vectorResults:
      Awaited<
        ReturnType<typeof retrieve>
      > = [];

    let keywordResults:
      Awaited<
        ReturnType<typeof keywordSearch>
      > = [];

    let vectorSearchFailed = false;

    let keywordSearchFailed = false;

    // -------------------------------------------------
    // Vector Search
    // -------------------------------------------------

    try {
      vectorResults =
        await retrieve(
          query,
          10,
          0.3,
          filter
        );

      vectorSuccessCount++;
    } catch (error) {
      vectorSearchFailed = true;

      vectorFailureCount++;

      console.error(
        "[RAG] Vector search failed:",
        {
          query,
          error,
        }
      );
    }

    // -------------------------------------------------
    // Keyword Search
    // -------------------------------------------------

    try {
      keywordResults =
        await keywordSearch(
          query,
          10,
          filter
        );

      keywordSuccessCount++;
    } catch (error) {
      keywordSearchFailed = true;

      keywordFailureCount++;

      console.error(
        "[RAG] Keyword search failed:",
        {
          query,
          error,
        }
      );
    }

    // -------------------------------------------------
    // 当前 Query 两种 Retrieval 都失败
    // -------------------------------------------------

    if (
      vectorSearchFailed &&
      keywordSearchFailed
    ) {
      console.error(
        "[RAG] Both retrieval methods failed:",
        {
          query,
        }
      );

      continue;
    }

    // -------------------------------------------------
    // 当前 Query RRF
    // -------------------------------------------------

    let hybridResults;

    try {
      hybridResults =
        reciprocalRankFusion(
          vectorResults,
          keywordResults,
          10
        );
    } catch (error) {
      console.error(
        "[RAG] RRF failed:",
        {
          query,
          error,
        }
      );

      continue;
    }

    retrievalResults.push(
      hybridResults
    );

    console.log(
      "[RAG Stage] Query Retrieval Complete:",
      {
        query,

        vectorResults:
          vectorResults.length,

        keywordResults:
          keywordResults.length,

        hybridResults:
          hybridResults.length,
      }
    );
  }

  const retrievalLatencyMs =
    retrievalTimer.end();

  // =================================================
  // 4. Merge Multi Query Results
  // =================================================

  let hybridResults=[];

  try {
    hybridResults =
      mergeMultiQueryResults(
        retrievalResults
      ).slice(0, 10);
  } catch (error) {
    throw new RagError(
      "hybrid",
      "Multi-query result merge failed",
      error
    );
  }


  // =================================================
  // 5. Retrieval Trace
  // =================================================

  if (trace) {
    trace.retrieval = {
      topK: 10,

      candidateCount:
        hybridResults.length,

      latencyMs:
        retrievalLatencyMs,
    };

    trace.keywordRetrieval = {
      candidateCount:
        keywordSuccessCount,

      latencyMs:
        retrievalLatencyMs,
    };
  }

  console.log(
    "\n[RAG Stage] Multi Query Retrieval:",
    {
      queries:
        multiQueries.length,

      vectorSuccess:
        vectorSuccessCount,

      vectorFailed:
        vectorFailureCount,

      keywordSuccess:
        keywordSuccessCount,

      keywordFailed:
        keywordFailureCount,

      mergedResults:
        hybridResults.length,

      latencyMs:
        retrievalLatencyMs,
    }
  );

  // =================================================
  // 6. All Retrieval Failed
  // =================================================

  if (
    retrievalResults.length === 0
  ) {
    throw new RagError(
      "hybrid",
      "All multi-query retrievals failed"
    );
  }

  // =================================================
  // 7. Empty Retrieval
  // =================================================

  if (
    hybridResults.length === 0
  ) {
    return {
      rewrittenQuery,

      multiQueries,

      queryRewriteFallback,

      multiQueryFallback,

      vectorResults: [],

      keywordResults: [],

      hybridResults,

      rerankedResults: [],

      rerankFallback: false,
    };
  }

  // =================================================
  // 8. Rerank
  // =================================================

  let rerankedResults;

  let rerankFallback = false;

  const rerankTimer =
    startStageTimer();

  try {
    rerankedResults =
      await rerank(
        rewrittenQuery,
        hybridResults,
        3
      );

    const latencyMs =
      rerankTimer.end();

    if (trace) {
      trace.rerank = {
        model: "gpt-4o-mini",

        before:
          hybridResults.length,

        after:
          rerankedResults.length,

        latencyMs,
      };
    }
  } catch (error) {
    rerankFallback = true;

    const latencyMs =
      rerankTimer.end();

    console.error(
      "[RAG Stream] Rerank failed:",
      error
    );

    rerankedResults =
      hybridResults
        .slice(0, 3)
        .map((item) => ({
          ...item,
          rerankScore: null,
        }));

    if (trace) {
      trace.rerank = {
        model: "gpt-4o-mini",

        before:
          hybridResults.length,

        after:
          rerankedResults.length,

        latencyMs,
      };
    }
  }

  // =================================================
  // 9. Final Result
  // =================================================

  return {
    rewrittenQuery,

    multiQueries,

    queryRewriteFallback,

    multiQueryFallback,

    vectorResults: [],

    keywordResults: [],

    hybridResults,

    rerankedResults,

    rerankFallback,
  };
}




/**
 * 将完整的缓存答案重新包装成 Streaming。
 *
 * Cache Hit 时，前端仍然收到和正常 LLM
 * Streaming 一样的 stream。
 */
async function* streamCachedAnswer(
  answer: string 
) {
  const chunkSize = 20;
  console.log(answer,'streamCachedAnswer')
  for (
    let i = 0;
    i < answer.length;
    i += chunkSize
  ) {
    yield answer.slice(
      i,
      i + chunkSize
    );
  }
}


export async function answerQuestionStream(
  question: string,
  filter?: RetrievalFilter,
  requestId?: string
) {
  const trace =
    createRagTrace(question, requestId);

  /**
   * ------------------------------------------------
   * 1. 创建 Cache Key
   * ------------------------------------------------
   */
  const cacheKey =
    createCacheKey({
      question,
      filter,
    });

  /**
   * ------------------------------------------------
   * 2. 查询 Cache
   * ------------------------------------------------
   */
  const cached =
    getCache(cacheKey);

  /**
   * ------------------------------------------------
   * 3. Cache Hit
   * ------------------------------------------------
   */
  console.log(cached,'cached')
  if (cached) {
    console.log(
      "[RAG Cache] HIT:",
      cacheKey
    );

    trace.cache = { hit: true };

    finishRagTrace(trace);

    return {
      stream:
         streamCachedAnswer(
          cached.answer
        ),

      sources:
        cached.sources,

      citationValidation:
        cached.citationValidation,

      cacheHit: true,

      requestId: trace.requestId,

      debug: {
        cacheHit: true,
      },
    };
  } 

  console.log(
    "[RAG Cache] MISS:",
    cacheKey
  );

  /**
   * ------------------------------------------------
   * 4. Cache Miss → 正常 RAG
   * ------------------------------------------------
   */
  const ragResult =
    await prepareRagContext(
      question,
      filter,
      trace
    );

  /**
   * ------------------------------------------------
   * 5. 没有检索结果
   * ------------------------------------------------
   */
  if (
    ragResult.hybridResults.length === 0
  ) {
    return {
      stream: null,

      sources: [],

      citationValidation: {
        status: "missing" as const,
        citationCount: 0,
        citedSourceIds: [],
        invalidSourceIds: [],
      },

      cacheHit: false,

      debug: {
        rewrittenQuery:
          ragResult.rewrittenQuery,

        multiQueries:
          ragResult.multiQueries,

        queryRewriteFallback:
          ragResult.queryRewriteFallback,

        vectorResults:
          ragResult.vectorResults.length,

        keywordResults:
          ragResult.keywordResults.length,

        hybridResults: 0,

        rerankFallback:
          ragResult.rerankFallback,

        cacheHit: false,
      },
    };
  }

  /**
   * ------------------------------------------------
   * 6. 构建 Context
   * ------------------------------------------------
   */
  const context =
    ragResult.rerankedResults
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

  /**
   * ------------------------------------------------
   * 7. 构建 Sources
   * ------------------------------------------------
   */
  const sources =
    ragResult.rerankedResults.map(
      (item, index): CitationSource => ({
        id: index + 1,

        source:
          item.source,

        title:
          item.title,

        section:
          item.section,

        chunkIndex:
          item.chunkIndex,

        rrfScore:
          item.rrfScore,

        rerankScore:
          item.rerankScore,
      })
    );

  /**
   * ------------------------------------------------
   * 8. 调用 LLM Streaming
   * ------------------------------------------------
   */
  const llmStream =
    await generateAnswerStream(
      question,
      context
    );

  /**
   * ------------------------------------------------
   * 9. 包装 LLM Stream
   *
   * 一边向前端发送 token，
   * 一边收集完整 answer。
   * ------------------------------------------------
   */
  async function* streamWithCache() {
    let fullAnswer = "";
    const llmTimer = startStageTimer();

    for await (
      const chunk of llmStream
    ) {
      /*
       * chunk 是 OpenAI 的 ChatCompletionChunk 对象，
       * 不能直接 fullAnswer += chunk（会变成 "[object Object]"），
       * 必须先提取 delta.content。
       */
      const content =
        (
          chunk as {
            choices?: Array<{
              delta?: {
                content?: string;
              };
            }>;
          }
        ).choices?.[0]?.delta?.content ?? "";

      fullAnswer += content;

      yield chunk;
    }

    const latencyMs = llmTimer.end();

    trace.llm = {
      model: "gpt-4o-mini",
      latencyMs,
    };

    /**
     * LLM Streaming 完成以后，
     * 才能进行 Citation Validation。
     */
    const citationValidation =
      validateCitations(
        fullAnswer,
        sources
      );
    console.log(fullAnswer,'rag-stream')
    /**
     * ------------------------------------------------
     * 10. 写入 Cache
     * ------------------------------------------------
     */
    setCache(cacheKey, {
      answer: fullAnswer,

      sources,

      citationValidation,
    });

    trace.cache = { hit: false };

    finishRagTrace(trace);

    console.log(
      "[RAG Cache] SET:",
      cacheKey
    );
  }

  /**
   * ------------------------------------------------
   * 11. 返回结果
   * ------------------------------------------------
   */
  return {
    stream:
      streamWithCache(),

    sources,

    /**
     * Miss 时这里暂时为 null。
     *
     * 真正的 citationValidation 会在
     * stream 完成以后计算。
     */
    citationValidation: null,

    cacheHit: false,

    debug: {
      rewrittenQuery:
        ragResult.rewrittenQuery,

      multiQueries:
        ragResult.multiQueries,

      queryRewriteFallback:
        ragResult.queryRewriteFallback,

      vectorResults:
        ragResult.vectorResults.length,

      keywordResults:
        ragResult.keywordResults.length,

      hybridResults:
        ragResult.hybridResults.length,

      rerankResults:
        ragResult.rerankedResults.length,

      rerankFallback:
        ragResult.rerankFallback,

      cacheHit: false,
    },
  };
}
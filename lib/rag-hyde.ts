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
  generateDirectAnswerStream
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
    generateHypotheticalDocument,
  } from "./hyde";

import {
    expandParents
}  from "./parent-child";

import type {
    ParentExpandedDocument
} from "./parent-child";


import { routeQuery }  from "./route";

async function generateDirectAnswer(
  question: string,
  trace: RagTrace,
  cacheKey: string
) {
  const llmTimer = startStageTimer();

  const llmStream =
    await generateDirectAnswerStream(
      question
    );

  async function* streamDirectAnswer() {
    let fullAnswer = "";

    try {
      for await (
        const chunk of llmStream
      ) {
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

      const latencyMs =
        llmTimer.end();

      trace.llm = {
        model: "gpt-4o-mini",
        latencyMs,
      };

      const citationValidation = {
        status: "missing" as const,
        citationCount: 0,
        citedSourceIds: [],
        invalidSourceIds: [],
      };

      setCache(cacheKey, {
        answer: fullAnswer,

        sources: [],

        citationValidation,
      });

      trace.cache = {
        hit: false,
      };

      finishRagTrace(trace);

      console.log(
        "[RAG Cache] SET:",
        cacheKey
      );
    } catch (error) {
      const latencyMs =
        llmTimer.end();

      trace.llm = {
        model: "gpt-4o-mini",
        latencyMs,
      };

      console.error(
        "[RAG Stream] Direct LLM failed:",
        error
      );

      finishRagTrace(trace);

      throw error;
    }
  }

  return {
    stream:
      streamDirectAnswer(),

    sources: [],

    citationValidation: null,

    cacheHit: false,

    requestId:
      trace.requestId,

    debug: {
      route: "direct",
      cacheHit: false,
    },
  };
}

async function prepareVectorContext(
  question: string,
  filter?: RetrievalFilter,
  trace?: RagTrace
) {
  let rewrittenQuery = question;
  let queryRewriteFallback = false;

  const rewriteTimer = startStageTimer();

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
  } catch (error) {
    const latencyMs =
      rewriteTimer.end();

    queryRewriteFallback = true;

    rewrittenQuery = question;

    if (trace) {
      trace.rewrite = {
        latencyMs,
        fallback: true,
      };
    }

    console.error(
      "[RAG Stream] Vector query rewrite failed:",
      {
        latencyMs,
        error,
      }
    );
  }

  let vectorResults:
    Awaited<ReturnType<typeof retrieve>> = [];

  const retrievalTimer =
    startStageTimer();

  try {
    vectorResults =
      await retrieve(
        rewrittenQuery,
        10,
        0.3,
        filter,
        rewrittenQuery
      );

    const latencyMs =
      retrievalTimer.end();

    if (trace) {
      trace.retrieval = {
        topK: 10,
        candidateCount:
          vectorResults.length,
        latencyMs,
      };
    }
  } catch (error) {
    const latencyMs =
      retrievalTimer.end();

    console.error(
      "[RAG Stream] Vector search failed:",
      {
        latencyMs,
        error,
      }
    );

    throw new RagError(
      "retrieval",
      "Vector search failed",
      error
    );
  }

  const parentResults =
    expandParents(
      vectorResults,
      3
    );

  return {
    rewrittenQuery,

    queryRewriteFallback,

    vectorResults,

    keywordResults: [],

    hybridResults: vectorResults,

    rerankedResults: vectorResults.map(
      (item) => ({
        ...item,
        rerankScore: null,
      })
    ),

    rerankFallback: false,

    parentResults,
  };
}

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
        fallback: false,
      };
    }
  }

//===========================
// hyde
//===========================

  let hypotheticalDocument =
  rewrittenQuery;

let hydeFallback = false;

const hydeTimer =
  startStageTimer();

try {
  hypotheticalDocument =
    await generateHypotheticalDocument(
      rewrittenQuery
    );

  const latencyMs =
    hydeTimer.end();

  if (trace) {
    trace.hyde = {
      latencyMs,
      fallback: false,
    };
  }

  console.log(
    "[RAG Stage] HyDE:",
    latencyMs,
    "ms"
  );
} catch (error) {
  hydeFallback = true;

  const latencyMs =
    hydeTimer.end();

  console.error(
    "[RAG Stage] HyDE failed:",
    {
      latencyMs,
      error,
    }
  );

  hypotheticalDocument =
    rewrittenQuery;

  if (trace) {
    trace.hyde = {
      latencyMs,
      fallback: true,
    };
  }
}

  // =================================================
  // 2. Vector Search
  // =================================================

  let vectorResults:
    Awaited<ReturnType<typeof retrieve>> = [];

  let vectorSearchFailed = false;

  const retrievalTimer =
    startStageTimer();


  try {
    vectorResults =
      await retrieve(
        rewrittenQuery,
        10,
        0.3,
        filter,
        hypotheticalDocument
      );

    const latencyMs =
      retrievalTimer.end();

    if (trace) {
      trace.retrieval = {
        topK: 10,
        candidateCount:
          vectorResults.length,
        latencyMs,
      };
    }
  } catch (error) {
    vectorSearchFailed = true;

    const latencyMs =
      retrievalTimer.end();

    console.error(
      "[RAG Stream] Vector search failed:",
      error
    );
  }

  // =================================================
  // 3. Keyword Search
  // =================================================

  let keywordResults:
    Awaited<ReturnType<typeof keywordSearch>> = [];

  let keywordSearchFailed = false;

  const keywordTimer =
    startStageTimer();

  try {
    keywordResults =
      await keywordSearch(
        rewrittenQuery,
        10,
        filter
      );

    const latencyMs =
      keywordTimer.end();

    if (trace) {
      trace.keywordRetrieval = {
        candidateCount:
          keywordResults.length,
        latencyMs,
      };
    }
  } catch (error) {
    keywordSearchFailed = true;

    const latencyMs =
      keywordTimer.end();

    console.error(
      "[RAG Stream] Keyword search failed:",
      error
    );

    /*
    if (trace) {
      trace.keywordRetrieval = {
        candidateCount: keywordResults.length,
        latencyMs,
      };
    }
    */
  }

  // =================================================
  // 4. All Retrieval Failed
  // =================================================

  if (
    vectorSearchFailed &&
    keywordSearchFailed
  ) {
    throw new RagError(
      "hybrid",
      "Both vector search and keyword search failed"
    );
  }

  // =================================================
  // 5. Hybrid (RRF)
  // =================================================

  let hybridResults;

  try {
    hybridResults =
      reciprocalRankFusion(
        vectorResults,
        keywordResults,
        10
      );
  } catch (error) {
    throw new RagError(
      "hybrid",
      "Hybrid search failed",
      error
    );
  }

  // =================================================
  // 6. Empty Retrieval
  // =================================================

  if (hybridResults.length === 0) {
    return {
      rewrittenQuery,

      queryRewriteFallback,

      hydeFallback,

      vectorResults,

      keywordResults,

      hybridResults,

      rerankedResults: [],

      rerankFallback: false,
    };
  }

  // =================================================
  // 7. Rerank
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
        5
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
  // 8. Parent Expansion
  // =================================================

  let parentResults ;
    try{
        parentResults = expandParents(rerankedResults,3);
    }catch(error){
        parentResults = rerankedResults;
        console.error(
            "[RAG Stream] Parent expansion failed:",
            error
          );
    }

  // =================================================
  // 9. Final Result
  // =================================================

  return {
    rewrittenQuery,

    queryRewriteFallback,

    hydeFallback,

    vectorResults,

    keywordResults,

    hybridResults,

    rerankedResults,

    rerankFallback,

    parentResults
  };
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

    const decision = routeQuery(question);

    trace.route = decision.route;
  
    let ragResult;
  
    switch (decision.route) {
      case "direct":
        return generateDirectAnswer(
          question,
          trace,
          cacheKey
        );
  
      case "vector":
        ragResult =
          await prepareVectorContext(
            question,
            filter,
            trace
          );
        break;
  
      case "hybrid":
        ragResult =
          await prepareRagContext(
            question,
            filter,
            trace
          );
        break;
    }  
  
    /**
     * ------------------------------------------------
     * 4. Cache Miss → 正常 RAG
     * ------------------------------------------------
     */
    /* const ragResult =
      await prepareRagContext(
        question,
        filter,
        trace
      ); */
  
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
  
          queryRewriteFallback:
            ragResult.queryRewriteFallback,
  
          vectorResults:
            ragResult.vectorResults.length,
  
          keywordResults:
            ragResult.keywordResults.length,
  
          hybridResults: 0,
  
          rerankFallback:
            ragResult.rerankFallback,

          parentResults:
            ragResult.parentResults?.length||0,
  
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
      (ragResult.parentResults||[] as ParentExpandedDocument[])
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
  
        parentResults:
          ragResult.parentResults?.length||0,
  
        cacheHit: false,
      },
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
export interface RagMetrics {
    requests: number;
  
    successes: number;
  
    errors: number;
  
    cacheHits: number;
  
    cacheMisses: number;
  
    rewriteLatencies: number[];
  
    retrievalLatencies: number[];
  
    keywordRetrievalLatencies: number[];
  
    rerankLatencies: number[];
  
    llmLatencies: number[];
  
    totalLatencies: number[];
  }
  
  const metrics: RagMetrics = {
    requests: 0,
  
    successes: 0,
  
    errors: 0,
  
    cacheHits: 0,
  
    cacheMisses: 0,
  
    rewriteLatencies: [],
  
    retrievalLatencies: [],
  
    keywordRetrievalLatencies: [],
  
    rerankLatencies: [],
  
    llmLatencies: [],
  
    totalLatencies: [],
  };

  import type {
    RagTrace,
  } from "./trace";
  
  export function recordRagTrace(
    trace: RagTrace
  ) {
    metrics.requests += 1;
  
    if (trace.status === "success") {
      metrics.successes += 1;
    }
  
    if (trace.status === "error") {
      metrics.errors += 1;
    }
  
    if (trace.cache?.hit) {
      metrics.cacheHits += 1;
    } else if (
      trace.cache?.hit === false
    ) {
      metrics.cacheMisses += 1;
    }
  
    if (trace.rewrite) {
      metrics.rewriteLatencies.push(
        trace.rewrite.latencyMs
      );
    }
  
    if (trace.retrieval) {
      metrics.retrievalLatencies.push(
        trace.retrieval.latencyMs
      );
    }
  
    if (trace.keywordRetrieval) {
      metrics.keywordRetrievalLatencies.push(
        trace.keywordRetrieval.latencyMs
      );
    }
  
    if (trace.rerank) {
      metrics.rerankLatencies.push(
        trace.rerank.latencyMs
      );
    }
  
    if (trace.llm) {
      metrics.llmLatencies.push(
        trace.llm.latencyMs
      );
    }
  
    if (
      trace.totalLatencyMs !== undefined
    ) {
      metrics.totalLatencies.push(
        trace.totalLatencyMs
      );
    }
  }

  function average(
    values: number[]
  ): number | null {
    if (values.length === 0) {
      return null;
    }
  
    const total =
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      );
  
    return Math.round(
      total / values.length
    );
  }

  function percentile(
    values: number[],
    percentile: number
  ): number | null {
    if (values.length === 0) {
      return null;
    }
  
    const sorted = [
      ...values,
    ].sort(
      (a, b) => a - b
    );
  
    const index =
      Math.ceil(
        percentile *
          sorted.length
      ) - 1;
  
    return sorted[
      Math.max(0, index)
    ];
  }

  export function getRagMetrics() {
    const {
      requests,
      successes,
      errors,
      cacheHits,
      cacheMisses,
    } = metrics;
  
    return {
      requests,
  
      successes,
  
      errors,
  
      errorRate:
        requests === 0
          ? 0
          : errors / requests,
  
      cacheHits,
  
      cacheMisses,
  
      cacheHitRate:
        cacheHits + cacheMisses === 0
          ? 0
          : cacheHits /
            (cacheHits + cacheMisses),
  
      latency: {
        rewrite: {
          avg: average(
            metrics.rewriteLatencies
          ),
          p95: percentile(
            metrics.rewriteLatencies,
            0.95
          ),
        },
  
        retrieval: {
          avg: average(
            metrics.retrievalLatencies
          ),
          p95: percentile(
            metrics.retrievalLatencies,
            0.95
          ),
        },
  
        keywordRetrieval: {
          avg: average(
            metrics.keywordRetrievalLatencies
          ),
          p95: percentile(
            metrics.keywordRetrievalLatencies,
            0.95
          ),
        },
  
        rerank: {
          avg: average(
            metrics.rerankLatencies
          ),
          p95: percentile(
            metrics.rerankLatencies,
            0.95
          ),
        },
  
        llm: {
          avg: average(
            metrics.llmLatencies
          ),
          p95: percentile(
            metrics.llmLatencies,
            0.95
          ),
        },
  
        total: {
          avg: average(
            metrics.totalLatencies
          ),
          p95: percentile(
            metrics.totalLatencies,
            0.95
          ),
        },
      },
    };
  }

  export function resetRagMetrics() {
    metrics.requests = 0;
  
    metrics.successes = 0;
  
    metrics.errors = 0;
  
    metrics.cacheHits = 0;
  
    metrics.cacheMisses = 0;
  
    metrics.rewriteLatencies = [];
  
    metrics.retrievalLatencies = [];
  
    metrics.keywordRetrievalLatencies = [];
  
    metrics.rerankLatencies = [];
  
    metrics.llmLatencies = [];
  
    metrics.totalLatencies = [];
  }
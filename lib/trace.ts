export interface RagTrace {
  requestId: string;

  query: string;

  startedAt: number;

  embedding?: {
    model: string;
    latencyMs: number;
  };

  rewrite?: {
    latencyMs: number;
    fallback: boolean;
  };

  retrieval?: {
    topK: number;
    candidateCount: number;
    latencyMs: number;
  };

  keywordRetrieval?: {
    candidateCount: number;
    latencyMs: number;
  };

  scoreFilter?: {
    threshold: number;
    before: number;
    after: number;
  };

  rerank?: {
    model: string;
    before: number;
    after: number;
    latencyMs: number;
  };

  context?: {
    chunks: number;
    characters: number;
  };

  llm?: {
    model: string;
    latencyMs: number;
  };

  cache?: {
    hit: boolean;
  };

  totalLatencyMs?: number;

  status?: "success" | "error";

  error?: {
    stage?: string;
    message: string;
  };

  multiQuery?:{
    count?:number;
    latencyMs?:number;
    fallback?:boolean;
  }

  hyde?:{
    latencyMs?:number;
    fallback?:boolean;
  }

  route?:
    | "direct"
    | "vector"
    | "hybrid"
}

import {
  recordRagTrace,
} from "./metrics";

export function createRequestId(): string {
  return `rag_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createRagTrace(
  query: string,
  requestId?: string
): RagTrace {
  return {
    requestId:
      requestId ?? createRequestId(),

    query,

    startedAt: Date.now(),

    status: "success",
  };
}

export function finishRagTrace(
  trace: RagTrace
) {
  trace.totalLatencyMs =
    Date.now() - trace.startedAt;

  trace.status = "success";

  recordRagTrace(trace);

  logRagTrace(trace);
}

export function failRagTrace(
  trace: RagTrace,
  error: unknown,
  stage?: string
) {
  trace.totalLatencyMs =
    Date.now() - trace.startedAt;

  trace.status = "error";

  trace.error = {
    stage,

    message:
      error instanceof Error
        ? error.message
        : "Unknown error",
  };

  recordRagTrace(trace);

  console.error(
    "[RAG TRACE ERROR]",
    JSON.stringify(trace)
  );
}

export function startStageTimer() {
  const startedAt = performance.now();

  return {
    end() {
      return Math.round(
        performance.now() - startedAt
      );
    },
  };
}

export function printTrace(trace: RagTrace) {
  console.log("\n========== RAG Trace ==========");

  console.log("\nQuery:");
  console.log(trace.query);

  if (trace.embedding) {
    console.log("\n[Embedding]");
    console.log("Model:", trace.embedding.model);
    console.log(
      "Latency:",
      `${trace.embedding.latencyMs}ms`
    );
  }

  if (trace.retrieval) {
    console.log("\n[Vector Search]");
    console.log("Top-K:", trace.retrieval.topK);
    console.log(
      "Candidates:",
      trace.retrieval.candidateCount
    );
    console.log(
      "Latency:",
      `${trace.retrieval.latencyMs}ms`
    );
  }

  if (trace.scoreFilter) {
    console.log("\n[Score Filter]");
    console.log(
      "Threshold:",
      trace.scoreFilter.threshold
    );
    console.log(
      "Before:",
      trace.scoreFilter.before
    );
    console.log(
      "After:",
      trace.scoreFilter.after
    );
  }

  if (trace.rerank) {
    console.log("\n[Rerank]");
    console.log("Model:", trace.rerank.model);
    console.log(
      "Candidates:",
      trace.rerank.before
    );
    console.log(
      "Top-N:",
      trace.rerank.after
    );
    console.log(
      "Latency:",
      `${trace.rerank.latencyMs}ms`
    );
  }

  if (trace.context) {
    console.log("\n[Context]");
    console.log(
      "Chunks:",
      trace.context.chunks
    );
    console.log(
      "Characters:",
      trace.context.characters
    );
  }

  if (trace.llm) {
    console.log("\n[LLM]");
    console.log("Model:", trace.llm.model);
   // console.log("debug:", trace.llm.debug);
    console.log(
      "Latency:",
      `${trace.llm.latencyMs}ms`
    );
  }

  if (trace.totalLatencyMs !== undefined) {
    console.log("\n[Total]");
    console.log(
      "Latency:",
      `${trace.totalLatencyMs}ms`
    );
  }

  console.log("\n===============================\n");
}

export function logRagTrace(
  trace: RagTrace
) {
  console.log(
    "[RAG TRACE]",
    JSON.stringify({
      requestId: trace.requestId,
      query: trace.query,

      rewrite: trace.rewrite,

      embedding: trace.embedding,

      retrieval: trace.retrieval,

      keywordRetrieval:
        trace.keywordRetrieval,

      scoreFilter:
        trace.scoreFilter,

      rerank: trace.rerank,

      context: trace.context,

      llm: trace.llm,

      cache: trace.cache,

      totalLatencyMs:
        trace.totalLatencyMs,

      status: trace.status,

      error: trace.error,
    })
  );
}
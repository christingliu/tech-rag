export interface RagTrace {
  query: string;

  embedding?: {
    model: string;
    latencyMs: number;
  };

  retrieval?: {
    topK: number;
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
    debug:{
        trace: string;
        usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    }
  };

  totalLatencyMs?: number;
}

export function createTrace(query: string): RagTrace {
  return {
    query,
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
    console.log("debug:", trace.llm.debug);
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
import { createEmbedding } from "./embedding";

import {
  qdrant,
  COLLECTION_NAME,
} from "./qdrant";

import { generateAnswer } from "./llm";

import { rerank } from "./rerank";

import {
  createTrace,
  printTrace,
} from "./trace";

export async function retrieve(
  query: string,
  limit = 10,
  scoreThreshold = 0.3
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
  question: string
) {
  const totalStart = performance.now();

  const trace = createTrace(question);

  // =========================
  // Embedding
  // =========================

  const embeddingStart = performance.now();

  const vector = await createEmbedding(
    question
  );

  const embeddingLatency =
    performance.now() - embeddingStart;

  trace.embedding = {
    model: "text-embedding-3-small",
    latencyMs: Math.round(
      embeddingLatency
    ),
  };

  // =========================
  // Vector Search
  // =========================

  const retrievalStart = performance.now();

  const result = await qdrant.search(
    COLLECTION_NAME,
    {
      vector,
      limit: 10,
      with_payload: true,
    }
  );

  const retrievalLatency =
    performance.now() - retrievalStart;

  const candidates = result.map((item) => ({
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
  }));

  trace.retrieval = {
    topK: 10,
    candidateCount: candidates.length,
    latencyMs: Math.round(
      retrievalLatency
    ),
  };

  // =========================
  // Score Filter
  // =========================

  const scoreThreshold = 0.3;

  const results = candidates.filter(
    (item) =>
      item.score >= scoreThreshold
  );

  trace.scoreFilter = {
    threshold: scoreThreshold,
    before: candidates.length,
    after: results.length,
  };

  // =========================
  // Rerank
  // =========================

  const rerankStart = performance.now();

  const rerankedResults = await rerank(
    question,
    results,
    3
  );

  const rerankLatency =
    performance.now() - rerankStart;

  trace.rerank = {
    model: "gpt-4o-mini",
    before: results.length,
    after: rerankedResults.length,
    latencyMs: Math.round(
      rerankLatency
    ),
  };

  // =========================
  // Context
  // =========================

  const context = rerankedResults
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

  trace.context = {
    chunks: rerankedResults.length,
    characters: context.length,
  };

  // =========================
  // LLM
  // =========================

  const llmStart = performance.now();

  const llmResult = await generateAnswer(
    question,
    context
  );

  const llmLatency =
    performance.now() - llmStart;

  trace.llm = {
    model: llmResult.model,
    debug: {
      trace: llmResult.answer,
      usage: llmResult.usage ?? null,
    },
    latencyMs: Math.round(
      llmLatency
    ),
  };

  // =========================
  // Total
  // =========================

  trace.totalLatencyMs = Math.round(
    performance.now() - totalStart
  );

  printTrace(trace);

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
      })
    ),

    debug: {
      trace,
      usage: llmResult.usage,
    },
  };
}

import "./env";

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { retrieve } from "../lib/rag";

import {
  getDemoGraph,
  retrieveKnowledgeEvidence,
} from "../lib/rag-knowledge";

import {
  retrieveHybrid,
} from "../lib/hybrid-retriever";

import {
  createEvidenceKey,
  fromVectorChunk,
  fromGraphResult,
  type UnifiedEvidence,
  type EvidenceMetadata,
} from "../lib/unified-evidence";

// ======================================================
// 1. 配置
// ======================================================

const TOP_K = 5;
const SCORE_THRESHOLD = 0.3;
const MAX_HOPS = 1;

const DATASET_PATH = join(
  process.cwd(),
  "evaluation",
  "agent-retrieval-eval.json",
);

const OUTPUT_DIR = join(
  process.cwd(),
  "evaluation",
  "agent-retrieval",
);

interface EvalQuestion {
  id: string;
  question: string;
  goldEvidence: EvidenceMetadata[];
}

type RetrievalMethod = "vector" | "graph" | "hybrid";

interface QueryMetrics {
  recall: number;
  precision: number;
  reciprocalRank: number;
  hitCount: number;
  retrievedCount: number;
  hitEvidence: EvidenceMetadata[];
  missedEvidence: EvidenceMetadata[];
  retrievedEvidence: EvidenceMetadata[];
}

interface MethodResult {
  method: RetrievalMethod;
  queries: Array<{
    id: string;
    question: string;
    metrics: QueryMetrics;
  }>;
  summary: {
    recallAtK: number;
    precisionAtK: number;
    mrr: number;
    queryCount: number;
  };
}

// ======================================================
// 2. 加载测试数据
// ======================================================

function loadDataset(): EvalQuestion[] {
  const raw = readFileSync(
    DATASET_PATH,
    "utf-8",
  );

  const dataset = JSON.parse(raw) as EvalQuestion[];

  if (!Array.isArray(dataset) || dataset.length === 0) {
    throw new Error("EVAL_DATASET_EMPTY");
  }

  for (const item of dataset) {
    if (
      !item.id ||
      !item.question ||
      !Array.isArray(item.goldEvidence) ||
      item.goldEvidence.length === 0
    ) {
      throw new Error(
        `INVALID_EVAL_QUESTION: ${item.id}`,
      );
    }
  }

  return dataset;
}

// ======================================================
// 3. Evidence Metadata Key
// ======================================================

function getKey(
  evidence: EvidenceMetadata,
): string {
  return createEvidenceKey(evidence);
}

// ======================================================
// 4. 计算单题指标
// ======================================================

function evaluateQuery(
  goldEvidence: EvidenceMetadata[],
  retrievedEvidence: UnifiedEvidence[],
): QueryMetrics {
  const goldKeys = new Set(
    goldEvidence.map(getKey),
  );

  const retrievedTopK = retrievedEvidence.slice(
    0,
    TOP_K,
  );

  const retrievedKeys = retrievedTopK.map(
    (item) => getKey(item.metadata),
  );

  const retrievedKeySet = new Set(retrievedKeys);

  const hitEvidence = goldEvidence.filter(
    (item) => retrievedKeySet.has(getKey(item)),
  );

  const missedEvidence = goldEvidence.filter(
    (item) => !retrievedKeySet.has(getKey(item)),
  );

  const hitCount = hitEvidence.length;

  const recall =
    goldEvidence.length === 0
      ? 0
      : hitCount / goldEvidence.length;

  // Precision@K 使用固定 K 作为分母。
  const precision = hitCount / TOP_K;

  // 找到第一个相关 Evidence 的排名。
  let reciprocalRank = 0;

  for (let index = 0; index < retrievedTopK.length; index++) {
    const item = retrievedTopK[index];

    if (goldKeys.has(getKey(item.metadata))) {
      reciprocalRank = 1 / (index + 1);
      break;
    }
  }

  return {
    recall,
    precision,
    reciprocalRank,
    hitCount,
    retrievedCount: retrievedTopK.length,
    hitEvidence,
    missedEvidence,
    retrievedEvidence: retrievedTopK.map(
      (item) => item.metadata,
    ),
  };
}

// ======================================================
// 5. Vector 检索
// ======================================================

async function vectorSearch(
  query: string,
): Promise<UnifiedEvidence[]> {
  const chunks = await retrieve(
    query,
    TOP_K,
    SCORE_THRESHOLD,
  );

  return chunks.map((chunk) =>
    fromVectorChunk({
      content: chunk.content,
      score: chunk.score,
      source: chunk.source,
      title: chunk.title,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
    }),
  );
}

// ======================================================
// 6. Graph 检索
// ======================================================

async function graphSearch(
  query: string,
  graph: Awaited<ReturnType<typeof getDemoGraph>>,
): Promise<UnifiedEvidence[]> {
  const graphResult = await retrieveKnowledgeEvidence(
    graph,
    query,
    MAX_HOPS,
  );

  const nodeMap = new Map(
    [
      ...graphResult.matchedNodes,
      ...graphResult.expandedNodes,
    ].map((node) => [node.id, node]),
  );

  return fromGraphResult({
    nodes: [...nodeMap.values()],
    edges: graphResult.edges,
    evidence: graphResult.evidence,
    chunks: graphResult.chunks,
  });
}

// ======================================================
// 7. Hybrid 检索
// ======================================================

async function hybridSearch(
  query: string,
): Promise<UnifiedEvidence[]> {
  const result = await retrieveHybrid(
    query,
    {
      vectorTopK: TOP_K,
      scoreThreshold: SCORE_THRESHOLD,
      maxHops: MAX_HOPS,
    },
  );

  if (result.status === "failed") {
    throw new Error(
      `HYBRID_RETRIEVAL_FAILED: ${query}`,
    );
  }

  return result.evidence;
}

// ======================================================
// 8. 单一检索方式评测
// ======================================================

async function evaluateMethod(
  method: RetrievalMethod,
  dataset: EvalQuestion[],
  graph: Awaited<ReturnType<typeof getDemoGraph>>,
): Promise<MethodResult> {
  const queries: MethodResult["queries"] = [];

  for (const item of dataset) {
    let evidence: UnifiedEvidence[];

    switch (method) {
      case "vector":
        evidence = await vectorSearch(item.question);
        break;

      case "graph":
        evidence = await graphSearch(
          item.question,
          graph,
        );
        break;

      case "hybrid":
        evidence = await hybridSearch(item.question);
        break;
    }

    const metrics = evaluateQuery(
      item.goldEvidence,
      evidence,
    );

    queries.push({
      id: item.id,
      question: item.question,
      metrics,
    });

    console.log(
      `[${method}] ${item.id}`,
      {
        recall: metrics.recall.toFixed(3),
        precision: metrics.precision.toFixed(3),
        reciprocalRank:
          metrics.reciprocalRank.toFixed(3),
        hits: `${metrics.hitCount}/${item.goldEvidence.length}`,
      },
    );
  }

  const count = queries.length;

  const summary = {
    recallAtK:
      queries.reduce(
        (sum, item) => sum + item.metrics.recall,
        0,
      ) / count,

    precisionAtK:
      queries.reduce(
        (sum, item) => sum + item.metrics.precision,
        0,
      ) / count,

    mrr:
      queries.reduce(
        (sum, item) =>
          sum + item.metrics.reciprocalRank,
        0,
      ) / count,

    queryCount: count,
  };

  return {
    method,
    queries,
    summary,
  };
}

// ======================================================
// 9. 输出报告
// ======================================================

function printReport(
  results: MethodResult[],
): void {
  console.log("\n");
  console.log("========================================");
  console.log("V9.8.6.4 Retrieval Evaluation");
  console.log("========================================");

  console.table(
    results.map((result) => ({
      method: result.method,
      "Recall@5": result.summary.recallAtK.toFixed(3),
      "Precision@5": result.summary.precisionAtK.toFixed(3),
      MRR: result.summary.mrr.toFixed(3),
      questions: result.summary.queryCount,
    })),
  );

  for (const result of results) {
    console.log(`\n========== ${result.method} Bad Cases ==========`);

    for (const query of result.queries) {
      if (query.metrics.missedEvidence.length === 0) {
        continue;
      }

      console.log(`\n${query.id}: ${query.question}`);

      console.log(
        "Missed:",
        query.metrics.missedEvidence,
      );

      console.log(
        "Retrieved:",
        query.metrics.retrievedEvidence,
      );
    }
  }
}

function saveReport(
  results: MethodResult[],
): void {
  mkdirSync(OUTPUT_DIR, {
    recursive: true,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      topK: TOP_K,
      scoreThreshold: SCORE_THRESHOLD,
      maxHops: MAX_HOPS,
    },
    results,
  };

  const outputPath = join(
    OUTPUT_DIR,
    "retrieval-report.json",
  );

  writeFileSync(
    outputPath,
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  console.log("\n报告已保存：", outputPath);
}

// ======================================================
// 10. Main
// ======================================================

async function main() {
  const dataset = loadDataset();

  console.log("Evaluation Questions:", dataset.length);
  console.log("Top K:", TOP_K);
  console.log("Score Threshold:", SCORE_THRESHOLD);
  console.log("Max Hops:", MAX_HOPS);

  // Graph 的 Evidence 依赖 Qdrant 真实 Chunk。
  // 提前初始化，后续复用缓存。
  const graph = await getDemoGraph();

  console.log(
    "Graph Evidence Count:",
    graph.evidence.length,
  );

  const methods: RetrievalMethod[] = [
    "vector",
    "graph",
    "hybrid",
  ];

  const results: MethodResult[] = [];

  for (const method of methods) {
    console.log(`\n========== ${method.toUpperCase()} ==========`);

    const result = await evaluateMethod(
      method,
      dataset,
      graph,
    );

    results.push(result);
  }

  printReport(results);
  saveReport(results);

  console.log("\nV9.8.6.4 Retrieval Evaluation 完成");
}

main().catch((error) => {
  console.error("\nRetrieval Evaluation Failed:", error);
  process.exitCode = 1;
});

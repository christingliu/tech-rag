import "../scripts/env";
import fs from "node:fs/promises";
import path from "node:path";

import { retrieve } from "../lib/rag";
import { keywordSearch } from "../lib/keyword";
import { reciprocalRankFusion } from "../lib/hybrid";
import { rewriteQuery } from "../lib/query";

interface EvaluationCase {
  id: string;
  question: string;
  expectedSources: string[];
}

interface EvaluationResult {
  id: string;
  question: string;
  expectedSources: string[];
  retrievedSources: string[];

  hitRate: number | null;
  recall: number | null;
  precision: number | null;
  reciprocalRank: number | null;
  relevantRanks:Array<{
    source: string;
    rank: number;
  }>;
}

const TOP_K = 5;

async function loadDataset(): Promise<EvaluationCase[]> {
  const filePath = path.join(
    process.cwd(),
    "evaluation/dataset.json"
  );

  const content = await fs.readFile(
    filePath,
    "utf-8"
  );

  return JSON.parse(content);
}

/**
 * Hit Rate@K
 *
 * Top K 中是否至少命中了一个 expected source。
 */
function calculateHitRate(
  expectedSources: string[],
  retrievedSources: string[]
): number | null {
  if (expectedSources.length === 0) {
    return null;
  }

  const topK = retrievedSources.slice(0, TOP_K);

  const hit = topK.some((source) =>
    expectedSources.includes(source)
  );

  return hit ? 1 : 0;
}

/**
 * Recall@K
 *
 * Top K 命中的 relevant sources
 * /
 * 全部 expected relevant sources
 */
function calculateRecall(
  expectedSources: string[],
  retrievedSources: string[]
): number | null {
  if (expectedSources.length === 0) {
    return null;
  }

  const topK = retrievedSources.slice(0, TOP_K);

  const matched = expectedSources.filter(
    (source) =>
      topK.includes(source)
  );

  return matched.length / expectedSources.length;
}

/**
 * Precision@K
 *
 * Top K 中 relevant results 的比例。
 *
 * 当前评价粒度是 source level，
 * 因此 retrievedSources 中的每一个元素代表一个 source。
 */
function calculatePrecision(
  expectedSources: string[],
  retrievedSources: string[]
): number | null {
  if (expectedSources.length === 0) {
    return null;
  }

  const topK = retrievedSources.slice(0, TOP_K);

  if (topK.length === 0) {
    return 0;
  }

  const relevantCount = topK.filter(
    (source) =>
      expectedSources.includes(source)
  ).length;

  return relevantCount / topK.length;
}

/**
 * Reciprocal Rank
 *
 * 找到第一个 relevant source：
 *
 * RR = 1 / rank
 *
 * 例如：
 * relevant 出现在第 1 位 -> 1
 * relevant 出现在第 2 位 -> 0.5
 * relevant 出现在第 5 位 -> 0.2
 *
 * 多个 Case 的 RR 求平均后才是 MRR。
 */
function calculateReciprocalRank(
  expectedSources: string[],
  retrievedSources: string[]
): number | null {
  if (expectedSources.length === 0) {
    return null;
  }

  const topK = retrievedSources.slice(0, TOP_K);

  for (
    let index = 0;
    index < topK.length;
    index++
  ) {
    if (
      expectedSources.includes(
        topK[index]
      )
    ) {
      return 1 / (index + 1);
    }
  }

  return 0;
}

function findRelevantRanks(
  expectedSources: string[],
  retrievedSources: string[]
) {
  if (expectedSources.length === 0) {
    return [];
  }

  return expectedSources
    .map((source) => {
      const index =
        retrievedSources.indexOf(source);

      if (index === -1) {
        return null;
      }

      return {
        source,
        rank: index + 1,
      };
    })
    .filter(
      (
        item
      ): item is {
        source: string;
        rank: number;
      } => item !== null
    );
}

async function evaluateCase(
  item: EvaluationCase
): Promise<EvaluationResult> {
  const rewrittenQuery =
    await rewriteQuery(item.question);

  const vectorResults = await retrieve(
    rewrittenQuery,
    10,
    0.3
  );

  const keywordResults =
    await keywordSearch(
      rewrittenQuery,
      10
    );

  const candidates =
    reciprocalRankFusion(
      vectorResults,
      keywordResults,
      10
    );

  /**
   * 当前 dataset 的 Ground Truth 是 source level，
   * 所以将 retrieval result 映射成 source。
   *
   * 注意：
   * 这里暂时不直接 slice(0, TOP_K)，
   * 而是先保留 RRF 的完整排序。
   *
   * 后面的 metrics 自己负责取 Top K。
   */
  const retrievedSources = Array.from(
    new Set(
      candidates.map(
        (item) => item.source
      )
    )
  );

  return {
    id: item.id,
    question: item.question,
    expectedSources: item.expectedSources,
    retrievedSources,

    hitRate: calculateHitRate(
      item.expectedSources,
      retrievedSources
    ),

    recall: calculateRecall(
      item.expectedSources,
      retrievedSources
    ),

    precision: calculatePrecision(
      item.expectedSources,
      retrievedSources
    ),

    reciprocalRank:
      calculateReciprocalRank(
        item.expectedSources,
        retrievedSources
      ),

    relevantRanks:findRelevantRanks(
        item.expectedSources,
        retrievedSources
      )
  };
}

function calculateAverage(
  values: Array<number | null>
): number {
  const validValues = values.filter(
    (value): value is number =>
      value !== null
  );

  if (validValues.length === 0) {
    return 0;
  }

  return (
    validValues.reduce(
      (sum, value) => sum + value,
      0
    ) / validValues.length
  );
}

async function main() {
  const dataset = await loadDataset();

  const results: EvaluationResult[] = [];

  for (const item of dataset) {
    console.log(
      `\nEvaluating ${item.id}: ${item.question}`
    );

    const result =
      await evaluateCase(item);

    results.push(result);

    console.log({
      expectedSources:
        result.expectedSources,

      retrievedSources:
        result.retrievedSources.slice(
          0,
          TOP_K
        ),

      hitRate: result.hitRate,
      recall: result.recall,
      precision: result.precision,
      reciprocalRank:
        result.reciprocalRank,
    });
  }

  /**
   * expectedSources 非空的 Case
   * 才参与 Retrieval Metrics。
   */
  const normalCases =
    results.filter(
      (item) =>
        item.expectedSources.length > 0
    );

  const averageHitRate =
    calculateAverage(
      normalCases.map(
        (item) => item.hitRate
      )
    );

  const averageRecall =
    calculateAverage(
      normalCases.map(
        (item) => item.recall
      )
    );

  const averagePrecision =
    calculateAverage(
      normalCases.map(
        (item) => item.precision
      )
    );

  const averageMRR =
    calculateAverage(
      normalCases.map(
        (item) =>
          item.reciprocalRank
      )
    );

  console.log("\n====================");
  console.log("Evaluation Summary");
  console.log("====================");

  console.log(
    `Dataset: ${dataset.length}`
  );

  console.log(
    `Evaluated Retrieval Cases: ${normalCases.length}`
  );

  console.log(
    `K: ${TOP_K}`
  );

  console.log(
    `Hit Rate@${TOP_K}: ${averageHitRate.toFixed(3)}`
  );

  console.log(
    `Recall@${TOP_K}: ${averageRecall.toFixed(3)}`
  );

  console.log(
    `Precision@${TOP_K}: ${averagePrecision.toFixed(3)}`
  );

  console.log(
    `MRR: ${averageMRR.toFixed(3)}`
  );

  console.log("\nDetails:");

  for (const result of results) {
    console.log({
      id: result.id,

      hitRate: result.hitRate,

      recall: result.recall,

      precision:
        result.precision,

      rr: result.reciprocalRank,

      expectedSources:result.expectedSources,

      retrievedSources:result.retrievedSources

    });

    console.log(
     
    );
  
    if (
      result.relevantRanks.length === 0
    ) {
      console.log("Relevant Ranks:none");
    } else {
      for (const item of result.relevantRanks) {
        console.log( "Relevant Ranks:",
          `  - ${item.source}: rank ${item.rank}`
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
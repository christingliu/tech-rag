import "../scripts/env";
import fs from "node:fs/promises";
import path from "node:path";

import { retrieve } from "../lib/rag";
//import { getAllDocuments } from "../lib/rag";
import {
  keywordSearch,
} from "../lib/keyword";
import {
  reciprocalRankFusion,
} from "../lib/hybrid";
import {
  rewriteQuery,
} from "../lib/query";


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
  recall: number;
  reciprocalRank: number;
}

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

function calculateRecall(
  expectedSources: string[],
  retrievedSources: string[]
) {
  if (expectedSources.length === 0) {
    return 1;
  }

  const matched = expectedSources.filter(
    (source) =>
      retrievedSources.includes(source)
  );

  return matched.length / expectedSources.length;
}

function calculateMRR(
  expectedSources: string[],
  retrievedSources: string[]
) {
  if (expectedSources.length === 0) {
    return 1;
  }

  for (
    let index = 0;
    index < retrievedSources.length;
    index++
  ) {
    if (
      expectedSources.includes(
        retrievedSources[index]
      )
    ) {
      return 1 / (index + 1);
    }
  }

  return 0;
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

  /* const allDocuments =
    await getAllDocuments(); */

  const keywordResults = await keywordSearch(
    rewrittenQuery,
    10
  );

  const candidates =
    reciprocalRankFusion(
      vectorResults,
      keywordResults,
      10
    );

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
    recall: calculateRecall(
      item.expectedSources,
      retrievedSources
    ),
    reciprocalRank: calculateMRR(
      item.expectedSources,
      retrievedSources
    ),
  };
}

async function main() {
  const dataset = await loadDataset();

  const results: EvaluationResult[] = [];

  for (const item of dataset) {
    //if(item.id !== "q010") continue;
    console.log(
      `\nEvaluating ${item.id}: ${item.question}`
    );

    const result = await evaluateCase(item);

    results.push(result);

    console.log({
      expectedSources: result.expectedSources,
      retrievedSources:
        result.retrievedSources,
      recall: result.recall,
      reciprocalRank:
        result.reciprocalRank,
    });
  }

  const normalCases = results.filter(
    (item) =>
      item.expectedSources.length > 0
  );

  const averageRecall =
    normalCases.length > 0
      ? normalCases.reduce(
          (sum, item) =>
            sum + item.recall,
          0
        ) / normalCases.length
      : 0;

  const averageMRR =
    normalCases.length > 0
      ? normalCases.reduce(
          (sum, item) =>
            sum + item.reciprocalRank,
          0
        ) / normalCases.length
      : 0;

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
    `Recall: ${averageRecall.toFixed(3)}`
  );

  console.log(
    `MRR: ${averageMRR.toFixed(3)}`
  );

  console.log("\nDetails:");

  for (const result of results) {
    console.log({
      id: result.id,
      recall: result.recall,
      mrr: result.reciprocalRank,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
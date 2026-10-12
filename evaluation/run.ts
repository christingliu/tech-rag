import "../scripts/env";
import fs from "node:fs/promises";
import path from "node:path";

import { retrieve } from "../lib/rag";
import { prepareRagContext } from "../lib/rag-hyde";
import { generateAnswer } from "../lib/llm";
import { keywordSearch } from "../lib/keyword";
import { reciprocalRankFusion } from "../lib/hybrid";
import { rewriteQuery } from "../lib/query";
import { judgeAnswerCorrectness, judgeAnswerRelevance , judgeAnswerFaithfulness, judgeAnswerCitationSupport,type FaithfulnessClaim} from "./judge";
import { validateCitations ,type ParsedCitation} from "./citations";

import {
  saveEvaluationReport,
} from "./report";
import {
  REGRESSION_DATASET_VERSION,
} from "./dataset-validation";
interface EvaluationCase {
  id: string;
  question: string;
  expectedSources: string[];
  referenceAnswer: string;
}

interface EvaluationResult {
  id: string;
  question: string;
  generatedAnswer: string;
  referenceAnswer: string;
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
  correctness: number | null;
  correctnessReason: string;
  relevance: number | null;
  relevanceReason: string;

  faithfulness: number;
  supportedClaims: number;
  totalClaims: number;
  faithfulnessClaims: FaithfulnessClaim[];

  citations: ParsedCitation[];
  validCitations: number;
  invalidCitations: number;
  contextSourceIds: number[];

  citationCoverage: number | null;
  citationSupportRate: number | null;
  uncitedClaims: number;
}

const TOP_K = 5;

const runId = `run-${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}`;

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

async function generateEvaluationAnswer( question: string ): Promise<{ answer: string; context: string }> {
   const ragResult = await prepareRagContext(question);
   if ( ragResult.rerankedResults.length === 0 ) {
     return {
       answer: "知识库中没有找到相关信息。",
       context: "",
     };
     }
     const context = buildEvaluationContext( ragResult.rerankedResults );
     const result = await generateAnswer( question, context );
     return {
       answer: result.answer,
       context,
     };
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

function buildEvaluationContext( rerankedResults: Awaited< ReturnType<typeof prepareRagContext> >["rerankedResults"] ): string { 
  return rerankedResults .map( (item, index) => ` 
  [Source ${index + 1}] 
   Source: ${item.source} 
   Title: ${item.title} 
   Section: ${item.section} ${item.content} 
   ` ) .join("\n\n");
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

  /** * ================================================= * V7.2 Generation Metrics * * 使用当前完整 RAG Pipeline。 * ================================================= */
  const {
    answer: generatedAnswer,
    context,
  } = await generateEvaluationAnswer( item.question );

  const citationValidation = validateCitations(
    generatedAnswer,
    context
  );

  const correctnessJudge = await judgeAnswerCorrectness(
    item.question,
    item.referenceAnswer,
    generatedAnswer
  );

  const relevanceResult = await judgeAnswerRelevance(
    item.question,
    generatedAnswer
  );

  const faithfulnessResult = await judgeAnswerFaithfulness(
    context,
    generatedAnswer
  );

  const citationSupportResult = await judgeAnswerCitationSupport(
    context,
    generatedAnswer
  )

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
      ),
    generatedAnswer,
     
    referenceAnswer:item.referenceAnswer,

    correctness:correctnessJudge.score,

    correctnessReason:correctnessJudge.reason,

    relevance: relevanceResult.score, 
    
    relevanceReason: relevanceResult.reason,

    faithfulness: faithfulnessResult.score,
    
    supportedClaims:faithfulnessResult.supportedClaims,
    
    totalClaims:faithfulnessResult.totalClaims,
    
    faithfulnessClaims:faithfulnessResult.claims,

    citations: citationValidation.citations,

    validCitations:
      citationValidation.validCitations,

    invalidCitations:
      citationValidation.invalidCitations,

    contextSourceIds:
      citationValidation.contextSourceIds,

    citationCoverage: citationSupportResult.citationCoverage,

    citationSupportRate: citationSupportResult.citationSupportRate,

    uncitedClaims: citationSupportResult.uncitedClaims
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

function calculateAverageScore(
  values: Array<number | null>
): number {
  const validValues =
    values.filter(
      (value): value is number =>
        value !== null
    );

  if (validValues.length === 0) {
    return 0;
  }

  return (
    validValues.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / validValues.length
  );
}

function calculateAverageRelevance(
  values: Array<number | null>
): number {
  const validValues =
    values.filter(
      (value): value is number =>
        value !== null
    );

  if (validValues.length === 0) {
    return 0;
  }

  return (
    validValues.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / validValues.length
  );
}

/**
 * Faithfulness
 *
 * 答案中的声明能被检索 Context 支持的比例。
 *
 * 只有 totalClaims > 0 的 Case 参与平均；
 * 全部 Case 都没有可检验声明时视为 1
 * （没有声明即不存在不忠实的内容）。
 */
function calculateAverageFaithfulness(
  results: EvaluationResult[]
): number {
  const faithfulnessCases =
    results.filter(
      (result) => result.totalClaims > 0
    );

  if (faithfulnessCases.length === 0) {
    return 1;
  }

  return (
    faithfulnessCases.reduce(
      (sum, result) =>
        sum + result.faithfulness,
      0
    ) / faithfulnessCases.length
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


    const averageCorrectness =
    calculateAverageScore(
      results.map(
        (item) => item.correctness
      )
    ) / 5;

    const averageRelevance =
    calculateAverageRelevance(
      results.map(
        (item) => item.relevance
      )
    );

    const averageFaithfulness =
    calculateAverageFaithfulness(
      results
    );

    const totalCitations = results.reduce(
      (sum, result) =>
        sum + result.validCitations + result.invalidCitations,
      0
    );
    
    const totalValidCitations = results.reduce(
      (sum, result) => sum + result.validCitations,
      0
    );
    
    const totalInvalidCitations = results.reduce(
      (sum, result) => sum + result.invalidCitations,
      0
    );
    
    const citationValidity =
      totalCitations === 0
        ? null
        : totalValidCitations / totalCitations;
    


  /* console.log("\n====================");
  console.log("Evaluation Summary");
  console.log("===================="); */

  /* console.log(
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

  console.log(
    `Answer correctness: ${averageCorrectness.toFixed(3)}`
  );

  console.log(
    `Answer relevance: ${averageRelevance.toFixed(3)}/5`
  );

  console.log(
    `Answer faithfulness:${averageFaithfulness.toFixed(3)}`
  )

  console.log(
    `Total citations: ${totalCitations}`
  );
  
  console.log(
    `Valid citations: ${totalValidCitations}`
  );
  
  console.log(
    `Invalid citations: ${totalInvalidCitations}`
  );

  console.log()
  
  console.log(
    `Citation validity: ${
      citationValidity === null
        ? "N/A"
        : citationValidity.toFixed(3)
    }`
  );

  console.log("\nDetails:");
 */
  

  /* for (const result of results) {
    console.log({
      id: result.id,

      hitRate: result.hitRate,

      recall: result.recall,

      precision:
        result.precision,

      rr: result.reciprocalRank,

      expectedSources:result.expectedSources,

      retrievedSources:result.retrievedSources,

      generateAnswer:result.generatedAnswer,

      referenceAnswer:result.referenceAnswer,

      correctness:result.correctness,

      correctnessReason:result.correctnessReason,

      relevance: result.relevance, 
    
      relevanceReason: result.relevanceReason,

      faithfulness: result.faithfulness,
    
      supportedClaims:result.supportedClaims,
      
      totalClaims:result.totalClaims,
      
      faithfulnessClaims:result.faithfulnessClaims,

      citations: result.citations,

      validCitations: result.validCitations,

      invalidCitations: result.invalidCitations,

      contextSourceIds: result.contextSourceIds,

      citationCoverage: result.citationCoverage,

      citationSupportRate: result.citationSupportRate,

      uncitedClaims: result.uncitedClaims
    });
  
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
  } */
 
    const reportPath = await saveEvaluationReport({
      schemaVersion: 1,
      runId,
      createdAt: new Date().toISOString(),
      datasetVersion: REGRESSION_DATASET_VERSION,
      metrics: {
        retrievalHitRateAt5: averageHitRate,
        retrievalRecallAt5: averageRecall,
        retrievalPrecisionAt5: averagePrecision,
        mrr: averageMRR,
        answerCorrectness: averageCorrectness,
        answerRelevance: averageRelevance/5,
        answerFaithfulness: averageFaithfulness,
        citationValidity: citationValidity,
      },
      cases: results.map((r) => ({ ...r })),
    });
    console.log(`Evaluation report saved: ${reportPath}`);
}

main().catch((error) => {
  //const dataset = getRegressionDataset();

  //console.log(`Regression dataset: ${REGRESSION_DATASET_VERSION}`);
  //console.log(`Dataset cases: ${dataset.length}`);
  console.error(error);
  process.exit(1);
});
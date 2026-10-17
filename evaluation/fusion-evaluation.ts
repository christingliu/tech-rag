
/**
 * evaluation/fusion-evaluation.ts
 */

import {
    evaluateRetrieval,
    evaluateCitations,
    evaluateLatency,
    type RetrievalCase,
    type CitationCase,
  } from "./fusion-metrics";
  
  export interface FusionEvaluationRecord {
    queryId: string;
  
    baseline: {
      retrievalIds: string[];
      answer: string;
      citationIds: string[];
      supportedCitationIds: string[];
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
    };
  
    fusion: {
      retrievalIds: string[];
      answer: string;
      citationIds: string[];
      supportedCitationIds: string[];
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
    };
  
    relevantIds: string[];
    goldCitationIds: string[];
  }
  
  function retrievalCases(
    records: FusionEvaluationRecord[],
    variant: "baseline" | "fusion",
  ): RetrievalCase[] {
    return records.map((record) => ({
      queryId: record.queryId,
      relevantIds: record.relevantIds,
      retrievedIds: record[variant].retrievalIds,
    }));
  }
  
  function citationCases(
    records: FusionEvaluationRecord[],
    variant: "baseline" | "fusion",
  ): CitationCase[] {
    return records.map((record) => ({
      queryId: record.queryId,
      predictedCitationIds: record[variant].citationIds,
      goldCitationIds: record.goldCitationIds,
      supportedCitationIds:
        record[variant].supportedCitationIds,
    }));
  }
  
  export function evaluateFusion(
    records: FusionEvaluationRecord[],
    k = 5,
  ) {
    const baselineRetrieval = evaluateRetrieval(
      retrievalCases(records, "baseline"),
      k,
    );
  
    const fusionRetrieval = evaluateRetrieval(
      retrievalCases(records, "fusion"),
      k,
    );
  
    const baselineCitations = evaluateCitations(
      citationCases(records, "baseline"),
    );
  
    const fusionCitations = evaluateCitations(
      citationCases(records, "fusion"),
    );
  
    const baselineLatency = evaluateLatency(
      records.map((record) => record.baseline.latencyMs),
    );
  
    const fusionLatency = evaluateLatency(
      records.map((record) => record.fusion.latencyMs),
    );
  
    const sumTokens = (
      variant: "baseline" | "fusion",
    ) =>
      records.reduce(
        (sum, record) =>
          sum +
          (record[variant].inputTokens ?? 0) +
          (record[variant].outputTokens ?? 0),
        0,
      );
  
    return {
      queryCount: records.length,
      k,
  
      baseline: {
        retrieval: baselineRetrieval,
        citations: baselineCitations,
        latency: baselineLatency,
        totalTokens: sumTokens("baseline"),
      },
  
      fusion: {
        retrieval: fusionRetrieval,
        citations: fusionCitations,
        latency: fusionLatency,
        totalTokens: sumTokens("fusion"),
      },
  
      delta: {
        recallAtK:
          fusionRetrieval.recallAtK -
          baselineRetrieval.recallAtK,
  
        mrr:
          fusionRetrieval.mrr -
          baselineRetrieval.mrr,
  
        ndcgAtK:
          fusionRetrieval.ndcgAtK -
          baselineRetrieval.ndcgAtK,
  
        citationPrecision:
          fusionCitations.citationPrecision -
          baselineCitations.citationPrecision,
  
        citationRecall:
          fusionCitations.citationRecall -
          baselineCitations.citationRecall,
  
        citationF1:
          fusionCitations.citationF1 -
          baselineCitations.citationF1,
  
        p50Ms:
          fusionLatency.p50Ms -
          baselineLatency.p50Ms,
  
        p95Ms:
          fusionLatency.p95Ms -
          baselineLatency.p95Ms,
  
        totalTokens:
          sumTokens("fusion") -
          sumTokens("baseline"),
      },
    };
  }
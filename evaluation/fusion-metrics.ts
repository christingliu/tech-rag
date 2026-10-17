
/**
 * evaluation/fusion-metrics.ts
 *
 * 纯函数指标：检索质量、引用准确率和延迟分布。
 */

export interface RetrievalCase {
    queryId: string;
    /** 人工标注的相关 chunk / evidence ID */
    relevantIds: string[];
    /** 按检索排序排列的结果 ID */
    retrievedIds: string[];
    /** 可选：每个结果的相关性等级，0 表示不相关 */
    relevanceById?: Record<string, number>;
  }
  
  export interface RetrievalMetrics {
    recallAtK: number;
    mrr: number;
    ndcgAtK: number;
    queryCount: number;
  }
  
  function unique(values: string[]): string[] {
    return [...new Set(values)];
  }
  
  function dcg(relevances: number[]): number {
    return relevances.reduce(
      (sum, relevance, index) =>
        sum +
        (Math.pow(2, relevance) - 1) /
          Math.log2(index + 2),
      0,
    );
  }
  
  export function evaluateRetrieval(
    cases: RetrievalCase[],
    k = 5,
  ): RetrievalMetrics {
    if (!Number.isInteger(k) || k < 1) {
      throw new Error("k 必须是正整数");
    }
  
    if (cases.length === 0) {
      return {
        recallAtK: 0,
        mrr: 0,
        ndcgAtK: 0,
        queryCount: 0,
      };
    }
  
    let recallTotal = 0;
    let reciprocalRankTotal = 0;
    let ndcgTotal = 0;
  
    for (const item of cases) {
      const relevantIds = new Set(item.relevantIds);
      const retrieved = unique(item.retrievedIds).slice(0, k);
  
      // 没有人工标注相关项的 Query 不应混入平均 Recall。
      if (relevantIds.size > 0) {
        const hits = retrieved.filter((id) =>
          relevantIds.has(id),
        ).length;
  
        recallTotal += hits / relevantIds.size;
      }
  
      const firstRelevantIndex = retrieved.findIndex((id) =>
        relevantIds.has(id),
      );
  
      if (firstRelevantIndex >= 0) {
        reciprocalRankTotal += 1 / (firstRelevantIndex + 1);
      }
  
      const relevance = item.relevanceById ?? {};
  
      const actualDcg = dcg(
        retrieved.map((id) =>
          Math.max(0, relevance[id] ?? (relevantIds.has(id) ? 1 : 0)),
        ),
      );
  
      const idealGrades = Object.values(relevance)
        .map((value) => Math.max(0, value))
        .sort((a, b) => b - a)
        .slice(0, k);
  
      // 未提供等级标注时，相关项采用二元相关性。
      const ideal = idealGrades.length > 0
        ? idealGrades
        : Array.from(
            { length: Math.min(k, relevantIds.size) },
            () => 1,
          );
  
      const idealDcg = dcg(ideal);
  
      if (idealDcg > 0) {
        ndcgTotal += actualDcg / idealDcg;
      }
    }
  
    const recallCases = cases.filter(
      (item) => unique(item.relevantIds).length > 0,
    );
  
    return {
      recallAtK:
        recallCases.length > 0
          ? recallTotal / recallCases.length
          : 0,
      mrr: reciprocalRankTotal / cases.length,
      ndcgAtK: ndcgTotal / cases.length,
      queryCount: cases.length,
    };
  }
  
  export interface CitationCase {
    queryId: string;
    /** 答案中出现的引用 ID */
    predictedCitationIds: string[];
    /** 人工标注的必要支持证据 ID */
    goldCitationIds: string[];
    /** 答案中被判定为有证据支持的引用 ID */
    supportedCitationIds: string[];
  }
  
  export interface CitationMetrics {
    citationPrecision: number;
    citationRecall: number;
    citationF1: number;
    citationValidity: number;
    queryCount: number;
  }
  
  export function evaluateCitations(
    cases: CitationCase[],
  ): CitationMetrics {
    if (cases.length === 0) {
      return {
        citationPrecision: 0,
        citationRecall: 0,
        citationF1: 0,
        citationValidity: 0,
        queryCount: 0,
      };
    }
  
    let predictedTotal = 0;
    let supportedTotal = 0;
    let truePositiveTotal = 0;
    let goldTotal = 0;
    let validTotal = 0;
  
    for (const item of cases) {
      const predicted = unique(item.predictedCitationIds);
      const gold = new Set(item.goldCitationIds);
      const supported = new Set(item.supportedCitationIds);
  
      predictedTotal += predicted.length;
      goldTotal += gold.size;
  
      for (const id of predicted) {
        if (supported.has(id)) {
          supportedTotal++;
        }
  
        if (gold.has(id)) {
          truePositiveTotal++;
        }
  
        // 有效性：引用是否真实存在于本次提供给模型的证据集合。
        // 由调用方先校验引用 ID 后，再将有效 ID 传入 supportedCitationIds
        // 并不能区分“存在但不支持”与“不存在”，所以建议另做校验。
      }
    }
  
    const citationPrecision = predictedTotal > 0
      ? truePositiveTotal / predictedTotal
      : 0;
  
    const citationRecall = goldTotal > 0
      ? truePositiveTotal / goldTotal
      : 0;
  
    const citationF1 =
      citationPrecision + citationRecall > 0
        ? 2 * citationPrecision * citationRecall /
          (citationPrecision + citationRecall)
        : 0;
  
    // 该值应由外部校验得到；此处按支持性引用占比报告。
    const citationValidity = predictedTotal > 0
      ? supportedTotal / predictedTotal
      : 0;
  
    return {
      citationPrecision,
      citationRecall,
      citationF1,
      citationValidity,
      queryCount: cases.length,
    };
  }
  
  export interface LatencyMetrics {
    count: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
  }
  
  export function evaluateLatency(
    latencyMs: number[],
  ): LatencyMetrics {
    if (
      latencyMs.some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    ) {
      throw new Error("延迟必须是非负有限数值");
    }
  
    if (latencyMs.length === 0) {
      return {
        count: 0,
        meanMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        minMs: 0,
        maxMs: 0,
      };
    }
  
    const sorted = [...latencyMs].sort((a, b) => a - b);
  
    // Nearest-rank percentile，避免不同分位数实现造成比较偏差。
    const percentile = (p: number) =>
      sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  
    return {
      count: sorted.length,
      meanMs:
        sorted.reduce((sum, value) => sum + value, 0) /
        sorted.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
    };
  }
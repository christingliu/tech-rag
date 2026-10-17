
import {
    buildGraphContext,
    type GraphContextInput,
    type GraphContextResult,
  } from "@/lib/graph-context";
  
  /** 统一的向量检索证据格式，由现有 RAG 适配。 */
  export interface VectorRagEvidence {
    id: string;
    text: string;
    source?: string;
    score?: number;
  }
  
  /** 最终传递给生成模型的上下文。 */
  export interface FusedRagContext {
    query: string;
    vectorEvidence: VectorRagEvidence[];
    graphContext: GraphContextResult | null;
    promptContext: string;
    sources: Array<{
      id: string;
      source?: string;
      kind: "vector" | "graph";
    }>;
  }
  
  export interface GraphRagPipelineOptions {
    /** 是否启用 Graph RAG，默认 true */
    enableGraphRag?: boolean;
  
    /** 图谱上下文字符预算 */
    graphMaxChars?: number;
  
    /** 所有上下文的总字符预算 */
    totalMaxChars?: number;
  
    /** 最多保留多少条向量证据 */
    maxVectorEvidence?: number;
  
    /** 图谱检索异常时是否回退到 Vector RAG */
    graphFailureFallback?: boolean;
  }
  
  export interface GraphRagPipelineDependencies {
    vectorSearch: (
      query: string,
    ) => Promise<VectorRagEvidence[]>;
  
    graphSearch: (
      query: string,
    ) => Promise<GraphContextInput | null>;
  
    generate: (
      query: string,
      context: FusedRagContext,
    ) => Promise<string>;
  }
  
  const compareString = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  
  function cleanText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }
  
  /**
   * 将现有 Vector RAG 与 Graph RAG 融合。
   *
   * 向量检索是必需依赖；图谱检索是可选依赖。
   * 本模块不负责实体识别、图遍历、向量化或 LLM API 实现。
   */
  export async function runGraphRagPipeline(
    query: string,
    deps: GraphRagPipelineDependencies,
    options: GraphRagPipelineOptions = {},
  ): Promise<string> {
    const {
      enableGraphRag = true,
      graphMaxChars = 3000,
      totalMaxChars = 8000,
      maxVectorEvidence = 6,
      graphFailureFallback = true,
    } = options;
  
    if (!query.trim()) {
      throw new Error("query 不能为空");
    }
  
    if (!Number.isInteger(totalMaxChars) || totalMaxChars < 1) {
      throw new Error("totalMaxChars 必须是正整数");
    }
  
    if (!Number.isInteger(graphMaxChars) || graphMaxChars < 0) {
      throw new Error("graphMaxChars 必须是非负整数");
    }
  
    if (!Number.isInteger(maxVectorEvidence) || maxVectorEvidence < 0) {
      throw new Error("maxVectorEvidence 必须是非负整数");
    }
  
    // 向量检索必须成功；图谱检索独立失败，不应默认中断整个问答。
    const vectorPromise = deps.vectorSearch(query);
  
    const graphPromise: Promise<GraphContextInput | null> =
      enableGraphRag
        ? deps.graphSearch(query).catch((error: unknown) => {
            if (!graphFailureFallback) {
              throw error;
            }
            return null;
          })
        : Promise.resolve(null);
  
    const [rawVectorEvidence, graphInput] = await Promise.all([
      vectorPromise,
      graphPromise,
    ]);
  
    const vectorEvidence = rawVectorEvidence
      .filter((item) => item.id && cleanText(item.text))
      .slice()
      .sort((a, b) => {
        const scoreA = a.score ?? Number.NEGATIVE_INFINITY;
        const scoreB = b.score ?? Number.NEGATIVE_INFINITY;
  
        return (
          scoreB - scoreA ||
          compareString(a.id, b.id)
        );
      })
      .slice(0, maxVectorEvidence);
  
    let graphContext: GraphContextResult | null = null;
  
    if (graphInput && graphMaxChars > 0) {
      // 防止适配层传入与当前问题不一致的 query。
      graphContext = buildGraphContext(
        { ...graphInput, query },
        { maxChars: graphMaxChars },
      );
    }
  
    const vectorSection = vectorEvidence
      .map((item) => {
        const source = item.source ? ` | 来源：${item.source}` : "";
        return `[vector:${item.id}${source}]\n${cleanText(item.text)}`;
      })
      .join("\n\n");
  
    // 向量证据优先，图谱上下文使用剩余字符预算。
    const vectorHeader = vectorSection ? "向量检索证据：\n" : "";
    const graphHeader =
      graphContext?.text ? "\n\n图谱上下文：\n" : "";
  
    const fixedLength =
      vectorHeader.length +
      vectorSection.length +
      graphHeader.length;
  
    const vectorText =
      fixedLength > totalMaxChars
        ? vectorSection.slice(
            0,
            Math.max(0, totalMaxChars - vectorHeader.length),
          )
        : vectorSection;
  
    const graphBudget = Math.max(
      0,
      totalMaxChars -
        vectorHeader.length -
        vectorText.length -
        graphHeader.length,
    );
  
    const graphText =
      graphContext && graphBudget > 0
        ? graphContext.text.slice(0, graphBudget)
        : "";
  
    const promptContext = [
      vectorText ? `${vectorHeader}${vectorText}` : "",
      graphText ? `${graphHeader}${graphText}` : "",
    ]
      .filter(Boolean)
      .join("");
  
    const sources: FusedRagContext["sources"] = [
      ...vectorEvidence.map((item) => ({
        id: item.id,
        source: item.source,
        kind: "vector" as const,
      })),
      ...(graphContext?.includedEvidenceIds ?? []).map((id) => ({
        id,
        kind: "graph" as const,
      })),
    ];
  
    return deps.generate(query, {
      query,
      vectorEvidence,
      graphContext,
      promptContext,
      sources,
    });
  }
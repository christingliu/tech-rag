
import {
    calculateContextBudget,
    fitContextBlocks,
    type TokenBudgetOptions,
    type ContextBlock,
  } from "./token-budget";
  
  import {
    mergeUnifiedEvidence,
    type UnifiedEvidence,
  } from "./unified-evidence";
  
  /**
   * Hybrid Context Builder 配置
   *
   * 复用现有 TokenBudgetOptions，
   * 不重新定义 Token 预算参数。
   */
  export interface HybridContextOptions
    extends TokenBudgetOptions {
    /**
     * 自定义 Evidence 优先级。
     * 数值越大，越优先进入 LLM Context。
     *
     * 不传时，默认保持 Hybrid Retriever 的结果顺序。
     */
    getPriority?: (
      evidence: UnifiedEvidence,
      index: number,
    ) => number;
  }
  
  /**
   * Hybrid Context 构建结果
   */
  export interface HybridContextResult {
    context: string;
  
    budgetTokens: number;
    estimatedTokens: number;
  
    truncated: boolean;
  
    includedIds: string[];
    omittedIds: string[];
  
    // 方便后续生成阶段获取实际进入 Context 的证据
    includedEvidence: UnifiedEvidence[];
    omittedEvidence: UnifiedEvidence[];
  }
  
  /**
   * 将 UnifiedEvidence 格式化为 LLM 可读的上下文。
   *
   * 保留：
   * 1. Evidence ID
   * 2. 检索来源
   * 3. 原始文档位置
   * 4. Vector / Keyword 分数
   * 5. Graph 关系
   * 6. 原始 Chunk 内容
   */
  function formatEvidence(
    evidence: UnifiedEvidence,
  ): string {
    const {
      id,
      content,
      sources,
      scores,
      metadata,
      graphRelations,
    } = evidence;
  
    const scoreLines = [
      scores.vector !== undefined
        ? `Vector Score: ${scores.vector}`
        : undefined,
      scores.keyword !== undefined
        ? `Keyword Score: ${scores.keyword}`
        : undefined,
    ].filter(Boolean);
  
    const relationLines = graphRelations.map(
      (relation) =>
        `- ${relation.sourceEntityName} ` +
        `--${relation.relation}--> ` +
        `${relation.targetEntityName} ` +
        `(edgeId: ${relation.edgeId}, ` +
        `graphEvidenceId: ${relation.graphEvidenceId})`,
    );
  
    return [
      `[Evidence ID: ${id}]`,
      `Sources: ${sources.join(", ")}`,
      `Document: ${metadata.title}`,
      `Source: ${metadata.source}`,
      `Section: ${metadata.section}`,
      `Chunk Index: ${metadata.chunkIndex}`,
      ...(scoreLines.length > 0
        ? scoreLines
        : []),
      ...(relationLines.length > 0
        ? [
            "Graph Relations:",
            ...relationLines,
          ]
        : []),
      "Content:",
      content,
    ].join("\n");
  }
  
  /**
   * 构建 Vector + Graph 混合检索上下文。
   *
   * 流程：
   * 1. 合并重复 Evidence
   * 2. 格式化 Evidence
   * 3. 计算可用 Context Token 预算
   * 4. 按优先级筛选完整 Evidence
   * 5. 返回 Context 和证据追踪信息
   */
  export function buildHybridContext(
    systemPrompt: string,
    question: string,
    evidence: UnifiedEvidence[],
    options: HybridContextOptions,
  ): HybridContextResult {
    if (!question.trim()) {
      throw new Error("HYBRID_CONTEXT_QUESTION_EMPTY");
    }
  
    // 1. 合并重复 Evidence。
    // 同一 Chunk 即使同时来自 Vector 和 Graph，
    // 也只保留一个 ContextBlock。
    const mergedEvidence = mergeUnifiedEvidence(
      evidence,
    );

  
    // 2. 构建 ContextBlock。
    const blocks: ContextBlock[] =
      mergedEvidence.map((item, index) => {
        const priority = options.getPriority
          ? options.getPriority(item, index)
          : mergedEvidence.length - index;
  
        if (!Number.isFinite(priority)) {
          throw new Error(
            `INVALID_EVIDENCE_PRIORITY: ${item.id}`,
          );
        }
  
        return {
          id: item.id,
          text: formatEvidence(item),
          priority,
        };
      });
  
    // 3. 计算可用 Token 预算。
    // Prefix 必须与实际 LLM 请求中的固定内容一致。
    const promptPrefix = [
      systemPrompt,
      `用户问题：${question}`,
    ].join("\n\n");
  
    const budgetTokens = calculateContextBudget(
      promptPrefix,
      options,
    );
  
    // 4. 在预算内选择完整 Evidence。
    const result = fitContextBlocks(
      blocks,
      budgetTokens,
      options.tokenizer,
    );
  
    // 5. 根据 ID 找回原始 UnifiedEvidence。
    const evidenceById = new Map(
      mergedEvidence.map((item) => [
        item.id,
        item,
      ]),
    );
  
    return {
      context: result.text,
  
      budgetTokens: result.budgetTokens,
      estimatedTokens: result.estimatedTokens,
  
      truncated: result.truncated,
  
      includedIds: result.includedIds,
      omittedIds: result.omittedIds,
  
      includedEvidence: result.includedIds
        .map((id) => evidenceById.get(id))
        .filter(
          (item): item is UnifiedEvidence =>
            item !== undefined,
        ),
  
      omittedEvidence: result.omittedIds
        .map((id) => evidenceById.get(id))
        .filter(
          (item): item is UnifiedEvidence =>
            item !== undefined,
        ),
    };
  }
  
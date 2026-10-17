
import {
    calculateContextBudget,
    fitContextBlocks,
    type ContextBlock,
    type Tokenizer,
  } from "./token-budget";
  
  interface PromptBudgetConfig {
    contextWindow: number;
    reservedOutputTokens: number;
    safetyMargin?: number;
    tokenizer?: Tokenizer;
  }
  
  export function buildBudgetedRagContext(
    systemPrompt: string,
    question: string,
    vectorBlocks: ContextBlock[],
    graphBlocks: ContextBlock[],
    config: PromptBudgetConfig,
  ) {
    // 此处 prefix 必须与实际生成请求中的固定 Prompt 保持一致。
    const promptPrefix = [
      systemPrompt,
      `用户问题：${question}`,
    ].join("\n\n");
  
    const budgetTokens = calculateContextBudget(
      promptPrefix,
      config,
    );
  
    // Vector 证据优先，Graph RAG 作为增强上下文。
    const result = fitContextBlocks(
      [
        ...vectorBlocks.map((block) => ({
          ...block,
          priority: block.priority + 1000,
        })),
        ...graphBlocks,
      ],
      budgetTokens,
      config.tokenizer,
    );
  
    return {
      context: result.text,
      budgetTokens,
      estimatedTokens: result.estimatedTokens,
      truncated: result.truncated,
      includedIds: result.includedIds,
      omittedIds: result.omittedIds,
    };
  }

/**
 * lib/token-budget.ts
 *
 * Token 预算与保守估算。
 * 生产环境可以注入真实 tokenizer；未提供时使用启发式估算。
 */

export interface Tokenizer {
    countTokens(text: string): number;
  }
  
  export interface TokenBudgetOptions {
    /** 模型上下文窗口上限 */
    contextWindow: number;
  
    /** 为模型生成预留的 Token 数 */
    reservedOutputTokens: number;
  
    /** 安全余量比例，例如 0.15 */
    safetyMargin?: number;
  
    /** 可选的模型 tokenizer */
    tokenizer?: Tokenizer;
  }
  
  export interface TokenBudgetResult {
    text: string;
    estimatedTokens: number;
    budgetTokens: number;
    truncated: boolean;
    includedIds: string[];
    omittedIds: string[];
  }
  
  /**
   * 保守估算混合中英文文本的 Token 数。
   *
   * 说明：
   * - CJK 字符按 1.5 Token/字符估算；
   * - 其余字符按 3 字符/Token 估算；
   * - 这不是特定模型 tokenizer 的精确结果。
   */
  export function estimateTokensConservative(text: string): number {
    let cjkCount = 0;
    let otherCount = 0;
  
    for (const char of text) {
      if (/\s/u.test(char)) {
        otherCount += 0.25;
        continue;
      }
  
      if (/[\u2E80-\u9FFF\uF900-\uFAFF\u{20000}-\u{3134F}]/u.test(char)) {
        cjkCount += 1;
      } else {
        otherCount += 1;
      }
    }
  
    return Math.ceil(cjkCount * 1.5 + otherCount / 3);
  }
  
  export function countTokens(
    text: string,
    tokenizer?: Tokenizer,
  ): number {
    const count = tokenizer
      ? tokenizer.countTokens(text)
      : estimateTokensConservative(text);
  
    if (!Number.isFinite(count) || count < 0) {
      throw new Error("tokenizer 返回了无效的 Token 数");
    }
  
    return Math.ceil(count);
  }
  
  /**
   * 计算留给检索上下文的 Token 预算。
   *
   * promptPrefix 应包含系统指令、用户问题、聊天历史以及
   * 其他必定放入模型请求的内容。
   */
  export function calculateContextBudget(
    promptPrefix: string,
    options: TokenBudgetOptions,
  ): number {
    const {
      contextWindow,
      reservedOutputTokens,
      safetyMargin = 0.15,
      tokenizer,
    } = options;
  
    if (!Number.isInteger(contextWindow) || contextWindow < 1) {
      throw new Error("contextWindow 必须是正整数");
    }
  
    if (
      !Number.isInteger(reservedOutputTokens) ||
      reservedOutputTokens < 0
    ) {
      throw new Error("reservedOutputTokens 必须是非负整数");
    }
  
    if (
      !Number.isFinite(safetyMargin) ||
      safetyMargin < 0 ||
      safetyMargin >= 1
    ) {
      throw new Error("safetyMargin 必须在 [0, 1) 范围内");
    }
  
    const usableWindow = Math.floor(
      contextWindow * (1 - safetyMargin),
    );
  
    return Math.max(
      0,
      usableWindow -
        reservedOutputTokens -
        countTokens(promptPrefix, tokenizer),
    );
  }
  
  export interface ContextBlock {
    id: string;
    text: string;
    /** 数值越大，越优先保留 */
    priority: number;
  }
  
  /**
   * 以完整 block 为单位分配 Token 预算。
   * 不会通过字符串 slice 切断证据或引用。
   */
  export function fitContextBlocks(
    blocks: ContextBlock[],
    budgetTokens: number,
    tokenizer?: Tokenizer,
  ): TokenBudgetResult {
    if (!Number.isInteger(budgetTokens) || budgetTokens < 0) {
      throw new Error("budgetTokens 必须是非负整数");
    }
  
    const ids = new Set<string>();
  
    for (const block of blocks) {
      if (!block.id.trim()) {
        throw new Error("ContextBlock.id 不能为空");
      }
      if (ids.has(block.id)) {
        throw new Error(`重复的 ContextBlock ID: ${block.id}`);
      }
      ids.add(block.id);
    }
  
    const sorted = [...blocks].sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  
    const included: ContextBlock[] = [];
    const omitted: string[] = [];
    let usedTokens = 0;
  
    for (const block of sorted) {
      const candidate = [
        ...included.map((item) => item.text),
        block.text,
      ].join("\n\n");
  
      const candidateTokens = countTokens(candidate, tokenizer);
  
      if (candidateTokens <= budgetTokens) {
        included.push(block);
        usedTokens = candidateTokens;
      } else {
        omitted.push(block.id);
      }
    }
  
    // 输出按优先级排列的完整块；如需恢复原始顺序，可在调用侧排序。
    return {
      text: included.map((block) => block.text).join("\n\n"),
      estimatedTokens: usedTokens,
      budgetTokens,
      truncated: omitted.length > 0,
      includedIds: included.map((block) => block.id),
      omittedIds: omitted,
    };
  }
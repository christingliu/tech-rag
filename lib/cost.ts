export interface CostBreakdown {
    embedding: number;
    llmInput: number;
    llmOutput: number;
    total: number;
  }

  export interface ModelPricing {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
  }

  
  export function calculateInputCost(
    tokens: number,
    pricing: ModelPricing
  ) {
    return (
      (tokens / 1_000_000) *
      pricing.inputPerMillionTokens
    );
  }
  
  export function calculateOutputCost(
    tokens: number,
    pricing: ModelPricing
  ) {
    return (
      (tokens / 1_000_000) *
      pricing.outputPerMillionTokens
    );
  }
  
  export function calculateCost(
    usage: {
      embeddingTokens: number;
      promptTokens: number;
      completionTokens: number;
    },
    pricing: {
      embedding: ModelPricing;
      llm: ModelPricing;
    }
  ): CostBreakdown {
    const embedding =
      calculateInputCost(
        usage.embeddingTokens,
        pricing.embedding
      );
  
    const llmInput =
      calculateInputCost(
        usage.promptTokens,
        pricing.llm
      );
  
    const llmOutput =
      calculateOutputCost(
        usage.completionTokens,
        pricing.llm
      );
  
    return {
      embedding,
      llmInput,
      llmOutput,
      total:
        embedding +
        llmInput +
        llmOutput,
    };
  }

  function readCostEnv(
    name: string
  ) {
    const value =
      process.env[name];
  
    if (!value) {
      throw new Error(
        `${name} is not configured`
      );
    }
  
    const cost =
      Number(value);
  
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error(
        `${name} must be a non-negative number`
      );
    }
  
    return cost;
  }

  export function getPricing() {
    return {
      embedding: {
        inputPerMillionTokens:
          readCostEnv(
            "EMBEDDING_INPUT_COST_PER_1M"
          ),
  
        outputPerMillionTokens: 0,
      },
  
      llm: {
        inputPerMillionTokens:
          readCostEnv(
            "LLM_INPUT_COST_PER_1M"
          ),
  
        outputPerMillionTokens:
          readCostEnv(
            "LLM_OUTPUT_COST_PER_1M"
          ),
      },
    };
  }
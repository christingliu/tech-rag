import {
    getRagMetrics,
    getIngestionMetrics,
    getLlmMetrics
  } from "@/lib/metrics";

import {getPricing,calculateCost} from "@/lib/cost"
  
  export async function GET() {
    const ingestion =
      getIngestionMetrics();

    const llm =
      getLlmMetrics();

    const pricing =
      getPricing();

    const cost =
      calculateCost(
        {
          embeddingTokens:
            ingestion.embeddingTokens,

          promptTokens:
            llm.promptTokens,

          completionTokens:
            llm.completionTokens,
        },
        pricing
      );
      return Response.json({
        ...getRagMetrics(),
      
        ingestion,
      
        llm,
      
        cost,
      });
  }
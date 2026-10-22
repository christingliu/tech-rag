
import type { AgentToolName } from "./agent-controller";
import {
  ruleRouter,
  type QueryRoute,
} from "./query-router";
import {
  llmRouter,
  type LlmRouterOptions,
} from "./llm-query-router";

export type RouterSource = "rule" | "llm" | "fallback";

export interface HybridQueryRoute {
  route: QueryRoute;
  source: RouterSource;
  fallbackReason?: string;
}

export interface HybridRouterOptions extends LlmRouterOptions {
  /**
   * 默认降级工具。
   * 只有 LLM 路由失败时才使用。
   */
  fallbackTool?: AgentToolName;

  /**
   * 允许注入替代路由函数，以便进行 Mock 测试。
   */
  llmRouterFn?: typeof llmRouter;
}

const EXPLICIT_RULE_REASONS = new Set([
  "SIMPLE_CONVERSATION",
  "GRAPH_RELATION_INTENT",
  "EXACT_MATCH_INTENT",
]);

function getExplicitRuleRoute(query: string): QueryRoute | undefined {
  const route = ruleRouter(query);

  if (route.reason === "EMPTY_QUERY") {
    throw new Error("HYBRID_ROUTER_EMPTY_QUERY");
  }

  if (EXPLICIT_RULE_REASONS.has(route.reason)) {
    return route;
  }

  // DEFAULT_SEMANTIC_SEARCH 并不是明确的意图判断。
  // 交给 LLM 继续判断，而不是直接返回默认结果。
  return undefined;
}

function createFallbackRoute(
  fallbackTool: AgentToolName,
): QueryRoute {
  return {
    type: "tool",
    tool: fallbackTool,
    reason: "LLM_ROUTER_FALLBACK",
  };
}

export async function hybridRouter(
  query: string,
  options: HybridRouterOptions,
): Promise<HybridQueryRoute> {
  if (!query.trim()) {
    throw new Error("HYBRID_ROUTER_EMPTY_QUERY");
  }

  const explicitRoute = getExplicitRuleRoute(query);

  if (explicitRoute) {
    return {
      route: explicitRoute,
      source: "rule",
    };
  }

  const fallbackTool = options.fallbackTool ?? "vector_search";
  const routeWithLlm = options.llmRouterFn ?? llmRouter;

  try {
    const route = await routeWithLlm(query, {
      client: options.client,
      model: options.model,
    });

    return {
      route,
      source: "llm",
    };
  } catch (error) {
    const fallbackReason =
      error instanceof Error
        ? error.message
        : "UNKNOWN_ROUTER_ERROR";

    return {
      route: createFallbackRoute(fallbackTool),
      source: "fallback",
      fallbackReason,
    };
  }
}
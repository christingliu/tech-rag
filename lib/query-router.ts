
import type { AgentToolName } from "./agent-controller";

export type QueryRoute =
  | {
      type: "tool";
      tool: AgentToolName;
      reason: string;
    }
  | {
      type: "direct_answer";
      reason: string;
    };

interface RoutingRule {
  name: string;
  match: (query: string) => boolean;
  route: QueryRoute;
}

function normalizeQuery(query: string): string {
  return query
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * 只将明确的寒暄、致谢、告别作为直接回答。
 * 不要把普通的知识问题误判为闲聊。
 */
function isSimpleConversation(query: string): boolean {
  return /^(你好|您好|嗨|hi|hello|hey|谢谢|感谢|多谢|再见|拜拜|good morning|good night)[！!。.,， ]*$/.test(
    query,
  );
}

/**
 * 明确要求实体关系、依赖链或多跳查询时，
 * 优先使用 Graph RAG。
 */
function isGraphQuery(query: string): boolean {
  const patterns = [
    /关系/,
    /依赖关系/,
    /关联关系/,
    /上下游/,
    /上游.*下游/,
    /依赖链/,
    /调用链/,
    /关系链/,
    /多跳/,
    /图谱/,
    /知识图/,
    /通过.*关联/,
    /关联到/,
    /连接.*和/,
    /从.+到.+的路径/,
    /(?:哪些|什么|谁).*(?:依赖|引用|调用|关联|连接)/,
    /依赖.*(?:哪些|什么|模块)/
  ];

  return patterns.some((pattern) => pattern.test(query));
}

/**
 * 只有明确的精确匹配或原文查找意图，
 * 才优先走关键词检索。
 */
function isKeywordQuery(query: string): boolean {
  const patterns = [
    /精确(?:匹配|查找|搜索)/,
    /关键词(?:搜索|查找|匹配)/,
    /原文(?:查找|搜索|匹配)/,
    /全文(?:搜索|查找)/,
    /(?:是否|有没有|是否曾).*(?:出现|包含).*(?:原文|文档|文本)/,
    /(?:查找|搜索|匹配).*(?:完整字符串|原文|精确匹配)/,
    /(?:代码|标识符).*(?:精确查找|精确匹配)/,
    /文档中.*(?:出现|包含)/,
/明确.*(?:出现|包含)/
  ];

  return patterns.some((pattern) => pattern.test(query));
}

const rules: RoutingRule[] = [
  {
    name: "simple_conversation",
    match: isSimpleConversation,
    route: {
      type: "direct_answer",
      reason: "SIMPLE_CONVERSATION",
    },
  },
  {
    name: "graph_query",
    match: isGraphQuery,
    route: {
      type: "tool",
      tool: "graph_search",
      reason: "GRAPH_RELATION_INTENT",
    },
  },
  {
    name: "keyword_query",
    match: isKeywordQuery,
    route: {
      type: "tool",
      tool: "keyword_search",
      reason: "EXACT_MATCH_INTENT",
    },
  },
];

/**
 * 规则路由入口。
 * 未命中任何专用规则时，默认使用向量检索。
 */
export function ruleRouter(query: string): QueryRoute {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    return {
      type: "direct_answer",
      reason: "EMPTY_QUERY",
    };
  }

  for (const rule of rules) {
    if (rule.match(normalized)) {
      return { ...rule.route };
    }
  }

  return {
    type: "tool",
    tool: "vector_search",
    reason: "DEFAULT_SEMANTIC_SEARCH",
  };
}
export type QueryRoute =
  | "direct"
  | "vector"
  | "hybrid";

export interface QueryRouteDecision {
  route: QueryRoute;
  reason: string;
}

function normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

function isCasualQuery(
    query: string
): boolean {
    const exactMatches = new Set([
    "你好",
    "嗨",
    "hello",
    "hi",
    "hey",
    "谢谢",
    "感谢",
    "thanks",
    "再见",
    "拜拜",
    "bye",
    ]);

    return exactMatches.has(query);
}

function isNonKnowledgeQuery(
    query: string
  ): boolean {
    const patterns = [
      /^你是谁[？?]?$/,
      /^你能做什么[？?]?$/,
      /^帮我写一首/,
      /^帮我写个故事/,
      /^讲个笑话/,
    ];
  
    return patterns.some(
      (pattern) => pattern.test(query)
    );
  }

  function isKnowledgeQuery(
    query: string
  ): boolean {
    const patterns = [
      /^什么是/,
      /^什么叫/,
      /^介绍一下/,
      /^解释一下/,
      /^如何理解/,
      /^为什么/,
      /^怎么理解/,
      /^how do /i,
      /^what is /i,
      /^what's /i,
      /^why /i,
      /^how does /i,
    ];
  
    return patterns.some(
      (pattern) => pattern.test(query)
    );
  }

function containsComparison(
query: string
): boolean {
const patterns = [
    /和.*有什么区别/,
    /与.*有什么区别/,
    /区别/,
    /对比/,
    /比较/,
    /difference between/i,
    /compare/i,
    /vs\.?/i,
];

return patterns.some(
    (pattern) => pattern.test(query)
);
}  

function containsTroubleshootingIntent(
    query: string
  ): boolean {
    const patterns = [
      /怎么解决/,
      /如何解决/,
      /怎么排查/,
      /如何排查/,
      /报错/,
      /错误/,
      /失败/,
      /异常/,
      /bug/i,
      /error/i,
      /failed/i,
    ];
  
    return patterns.some(
      (pattern) => pattern.test(query)
    );
  }

  function containsTechnicalIdentifier(
    query: string
  ): boolean {
    const patterns = [
      /\buse[A-Z]\w*\b/,        // useMemo / useEffect
      /\bReact\.\w+\b/,         // React.memo
      /\b[A-Z][a-zA-Z]+\.\w+\b/, // API.method
      /```/,                    // code block
      /\bHTTP\s*[45]\d{2}\b/,
      /\b\d{3}\b/,
    ];
  
    return patterns.some(
      (pattern) => pattern.test(query)
    );
  }


  function containsMultipleConcepts(
    query: string
  ): boolean {
    const separators = [
      "和",
      "与",
      "以及",
      "还有",
      "同时",
      "以及",
      "and",
      "also",
    ];
  
    const separatorCount =
      separators.filter(
        (separator) =>
          query.includes(separator)
      ).length;
  
    return separatorCount >= 1;
  }

function isComplexKnowledgeQuery(
query: string
): boolean {
if (containsComparison(query)) {
    return true;
}

if (containsTroubleshootingIntent(query)) {
    return true;
}

if (containsTechnicalIdentifier(query)) {
    return true;
}

if (containsMultipleConcepts(query)) {
    return true;
}

return false;
}

export function routeQuery(
  query: string
): QueryRouteDecision {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    return {
      route: "direct",
      reason: "empty query",
    };
  }

  // 1. 明确属于闲聊/非知识请求
  if (isCasualQuery(normalized)) {
    return {
      route: "direct",
      reason: "casual conversation",
    };
  }

  // 2. 明确不需要知识库的请求
  if (isNonKnowledgeQuery(normalized)) {
    return {
      route: "direct",
      reason: "does not require knowledge retrieval",
    };
  }

  // 3. 明确属于复杂检索
  if (isComplexKnowledgeQuery(normalized)) {
    return {
      route: "hybrid",
      reason: "complex knowledge retrieval",
    };
  }

  // 4. 默认知识问题走 vector
  if (isKnowledgeQuery(normalized)) {
    return {
      route: "vector",
      reason: "simple knowledge retrieval",
    };
  }

  // 5. 对无法确定的问题，
  // 宁可检索，不直接回答
  return {
    route: "vector",
    reason: "uncertain query, use semantic retrieval",
  };
}
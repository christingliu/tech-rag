
import assert from "node:assert/strict";
import { ruleRouter } from "../lib/query-router";

const cases = [
  {
    name: "简单问候直接回答",
    query: "你好",
    expectedType: "direct_answer",
    expectedReason: "SIMPLE_CONVERSATION",
  },
  {
    name: "概念问题走向量检索",
    query: "React 的 useState 和 useEffect 分别解决什么问题？",
    expectedType: "tool",
    expectedTool: "vector_search",
    expectedReason: "DEFAULT_SEMANTIC_SEARCH",
  },
  {
    name: "精确匹配走关键词检索",
    query: "请精确查找 useEffect 的定义",
    expectedType: "tool",
    expectedTool: "keyword_search",
    expectedReason: "EXACT_MATCH_INTENT",
  },
  {
    name: "文档原文查找走关键词检索",
    query: "文档中是否明确出现了 useEffect 这个名称？",
    expectedType: "tool",
    expectedTool: "keyword_search",
    expectedReason: "EXACT_MATCH_INTENT",
  },
  {
    name: "实体依赖关系走图谱检索",
    query: "组件 A 依赖哪些模块？",
    expectedType: "tool",
    expectedTool: "graph_search",
    expectedReason: "GRAPH_RELATION_INTENT",
  },
  {
    name: "多跳关系走图谱检索",
    query: "从模块 A 到模块 B 的依赖链是什么？",
    expectedType: "tool",
    expectedTool: "graph_search",
    expectedReason: "GRAPH_RELATION_INTENT",
  },
  {
    name: "关系意图优先于精确匹配",
    query: "精确查找模块 A 和模块 B 的依赖关系",
    expectedType: "tool",
    expectedTool: "graph_search",
    expectedReason: "GRAPH_RELATION_INTENT",
  },
  {
    name: "一般知识问题默认向量检索",
    query: "如何优化 React 组件的性能？",
    expectedType: "tool",
    expectedTool: "vector_search",
    expectedReason: "DEFAULT_SEMANTIC_SEARCH",
  },
  {
    name: "空白输入单独标记",
    query: "   ",
    expectedType: "direct_answer",
    expectedReason: "EMPTY_QUERY",
  },
] as const;

for (const testCase of cases) {
  const actual = ruleRouter(testCase.query);
  
  assert.equal(
    actual.type,
    testCase.expectedType,
    `${testCase.name}: route type 不匹配`,
  );

  assert.equal(
    actual.reason,
    testCase.expectedReason,
    `${testCase.name}: route reason 不匹配`,
  );

  if (testCase.expectedType === "tool") {
    assert.equal(
      actual.type === "tool" ? actual.tool : undefined,
      testCase.expectedTool,
      `${testCase.name}: tool 不匹配`,
    );
  }
}

console.log(
  `V9.3.1 规则路由测试通过：${cases.length} 个用例`,
);
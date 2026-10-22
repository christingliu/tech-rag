
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  hybridRouter,
  type HybridRouterOptions,
} from "../lib/hybrid-query-router";
import type { QueryRoute } from "../lib/query-router";

function createOptions(
  llmRouterFn?: HybridRouterOptions["llmRouterFn"],
): HybridRouterOptions {
  return {
    client: {} as OpenAI,
    model: "mock-model",
    llmRouterFn,
  };
}

async function expectError(
  task: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  await assert.rejects(task, (error: unknown) => {
    return (
      error instanceof Error &&
      error.message === expectedMessage
    );
  });
}

async function main() {
  let llmCalls = 0;

  // 1. 明确的问候由规则直接处理，不调用 LLM。
  const greeting = await hybridRouter(
    "你好",
    createOptions(async () => {
      llmCalls += 1;
      throw new Error("不应该调用 LLM");
    }),
  );

  assert.deepEqual(greeting, {
    route: {
      type: "direct_answer",
      reason: "SIMPLE_CONVERSATION",
    },
    source: "rule",
  });
  assert.equal(llmCalls, 0);

  // 2. 明确的关系查询直接走 Graph RAG。
  const graph = await hybridRouter(
    "组件 A 依赖哪些模块？",
    createOptions(async () => {
      llmCalls += 1;
      throw new Error("不应该调用 LLM");
    }),
  );

  assert.equal(graph.source, "rule");
  assert.deepEqual(graph.route, {
    type: "tool",
    tool: "graph_search",
    reason: "GRAPH_RELATION_INTENT",
  });
  assert.equal(llmCalls, 0);

  // 3. 普通知识问题交给 LLM。
  const llmRoute: QueryRoute = {
    type: "tool",
    tool: "keyword_search",
    reason: "EXACT_IDENTIFIER_LOOKUP",
  };

  const routed = await hybridRouter(
    "请帮我定位 useEffect 的定义位置",
    createOptions(async () => {
      llmCalls += 1;
      return llmRoute;
    }),
  );

  assert.equal(routed.source, "llm");
  assert.deepEqual(routed.route, llmRoute);
  assert.equal(llmCalls, 1);

  // 4. LLM 调用失败时降级到向量检索。
  const fallback = await hybridRouter(
    "如何优化 React 组件的性能？",
    createOptions(async () => {
      throw new Error("MODEL_TIMEOUT");
    }),
  );

  assert.equal(fallback.source, "fallback");
  assert.deepEqual(fallback.route, {
    type: "tool",
    tool: "vector_search",
    reason: "LLM_ROUTER_FALLBACK",
  });
  assert.equal(fallback.fallbackReason, "MODEL_TIMEOUT");

  // 5. 可以配置其他降级工具。
  const customFallback = await hybridRouter(
    "如何优化 React 组件的性能？",
    {
      ...createOptions(async () => {
        throw new Error("MODEL_UNAVAILABLE");
      }),
      fallbackTool: "keyword_search",
    },
  );

  assert.equal(customFallback.source, "fallback");
  assert.equal(
    customFallback.route.type === "tool"
      ? customFallback.route.tool
      : undefined,
    "keyword_search",
  );

  // 6. 非法模型输出也应触发降级。
  const invalidOutput = await hybridRouter(
    "解释一下 React 的状态管理",
    createOptions(async () => {
      throw new Error("LLM_ROUTER_INVALID_JSON");
    }),
  );

  assert.equal(invalidOutput.source, "fallback");
  assert.equal(
    invalidOutput.fallbackReason,
    "LLM_ROUTER_INVALID_JSON",
  );

  // 7. 空输入必须拒绝，不能降级成正常检索。
  await expectError(
    () => hybridRouter("   ", createOptions()),
    "HYBRID_ROUTER_EMPTY_QUERY",
  );

  console.log("V9.3.3 混合路由测试通过：7 组场景");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
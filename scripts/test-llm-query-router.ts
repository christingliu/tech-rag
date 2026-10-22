
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { llmRouter } from "../lib/llm-query-router";

function createMockClient(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: async () =>
          ({
            choices: [
              {
                message: { content },
              },
            ],
          }) as never,
      },
    },
  } as unknown as OpenAI;
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
  const options = {
    client: createMockClient(
      JSON.stringify({
        type: "tool",
        tool: "graph_search",
        reason: "MULTI_HOP_RELATION_QUERY",
      }),
    ),
    model: "mock-model",
  };

  // 1. 正常的图谱路由
  const graphRoute = await llmRouter(
    "模块 A 间接依赖了哪些模块？",
    options,
  );

  assert.deepEqual(graphRoute, {
    type: "tool",
    tool: "graph_search",
    reason: "MULTI_HOP_RELATION_QUERY",
  });

  // 2. 语义检索路由
  const vectorRoute = await llmRouter(
    "解释一下 React 的 useState",
    {
      client: createMockClient(
        JSON.stringify({
          type: "tool",
          tool: "vector_search",
          reason: "SEMANTIC_KNOWLEDGE_QUERY",
        }),
      ),
      model: "mock-model",
    },
  );

  assert.equal(vectorRoute.type, "tool");
  assert.equal(
    vectorRoute.type === "tool" ? vectorRoute.tool : undefined,
    "vector_search",
  );

  // 3. 直接回答路由
  const directRoute = await llmRouter("你好", {
    client: createMockClient(
      JSON.stringify({
        type: "direct_answer",
        reason: "SIMPLE_CONVERSATION",
      }),
    ),
    model: "mock-model",
  });

  assert.deepEqual(directRoute, {
    type: "direct_answer",
    reason: "SIMPLE_CONVERSATION",
  });

  // 4. 非法 JSON
  await expectError(
    () =>
      llmRouter("测试问题", {
        client: createMockClient("not-json"),
        model: "mock-model",
      }),
    "LLM_ROUTER_INVALID_JSON",
  );

  // 5. 模型试图调用未注册的工具
  await expectError(
    () =>
      llmRouter("测试问题", {
        client: createMockClient(
          JSON.stringify({
            type: "tool",
            tool: "delete_database",
            reason: "INVALID_TOOL",
          }),
        ),
        model: "mock-model",
      }),
    "LLM_ROUTER_TOOL_NOT_ALLOWED",
  );

  // 6. 非法路由类型
  await expectError(
    () =>
      llmRouter("测试问题", {
        client: createMockClient(
          JSON.stringify({
            type: "unknown",
            reason: "UNKNOWN",
          }),
        ),
        model: "mock-model",
      }),
    "LLM_ROUTER_INVALID_ROUTE_TYPE",
  );

  // 7. 空问题不应该触发模型调用
  let called = false;

  const unusedClient = {
    chat: {
      completions: {
        create: async () => {
          called = true;
          throw new Error("不应调用模型");
        },
      },
    },
  } as unknown as OpenAI;

  await expectError(
    () =>
      llmRouter("   ", {
        client: unusedClient,
        model: "mock-model",
      }),
    "LLM_ROUTER_EMPTY_QUERY",
  );

  assert.equal(called, false);

  // 8. 空模型输出
  await expectError(
    () =>
      llmRouter("测试问题", {
        client: createMockClient(""),
        model: "mock-model",
      }),
    "LLM_ROUTER_EMPTY_OUTPUT",
  );

  console.log("V9.3.2 LLM Router 测试通过：8 组场景");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
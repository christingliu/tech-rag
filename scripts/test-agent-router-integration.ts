
import assert from "node:assert/strict";
import { runAgent } from "../lib/agent-hybrid-router-controller";

async function main() {
  const calls: string[] = [];

  const result = await runAgent(
    "React 的 useState 和 useEffect 分别解决什么问题？",
    {
      maxSteps: 4,

      initialRouter: async () => ({
        route: {
          type: "tool",
          tool: "vector_search",
          reason: "DEFAULT_SEMANTIC_SEARCH",
        },
        source: "rule",
      }),

      tools: {
        vector_search: {
          async execute() {
            calls.push("vector_search");

            return {
              ok: true,
              data: [],
              metadata: { resultCount: 0 },
            };
          },
        },

        keyword_search: {
          async execute() {
            calls.push("keyword_search");

            return {
              ok: true,
              data: [
                {
                  source: "react/hooks.md",
                  content:
                    "useState 管理组件状态；useEffect 处理副作用。",
                },
              ],
              metadata: { resultCount: 1 },
            };
          },
        },
      },

      decide: async (observation) => {
        // 首轮由 Router 指定 vector_search。
        // 检索无结果后，Controller 才能进入这里重新决策。
        if (
          observation.lastTool === "vector_search" &&
          observation.evidence.length > 0
        ) {
          return {
            action: {
              tool: "keyword_search",
              input: { query: observation.question },
              reason: "RETRY_AFTER_EMPTY_VECTOR_SEARCH",
            },
            done: false,
            reason: "REPLAN",
          };
        }

        if (
          observation.lastTool === "keyword_search" &&
          observation.evidence.length > 0
        ) {
          return {
            done: true,
            answer:
              "useState 用于管理组件状态；useEffect 用于处理副作用。",
            reason: "EVIDENCE_FOUND",
          };
        }

        return {
          done: true,
          answer: "目前没有足够证据回答。",
          reason: "NO_EVIDENCE",
        };
      },
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(result.routing?.initialRoute?.type, "tool");

  if (result.routing?.initialRoute?.type !== "tool") {
    throw new Error("初始路由不是工具路由");
  }

  assert.equal(
    result.routing.initialRoute.tool,
    "vector_search",
  );
  assert.equal(result.routing.routerSource, "rule");

  assert.deepEqual(calls, [
    "vector_search",
    "keyword_search",
  ]);

  assert.deepEqual(
    result.trace.map((item) => item.action.tool),
    ["vector_search", "keyword_search"],
  );

  assert.match(result.answer ?? "", /useState/);
  assert.match(result.answer ?? "", /useEffect/);

  console.log("V9.3.4 Router + Controller 集成测试通过");
  console.log({
    status: result.status,
    initialRoute: result.routing?.initialRoute,
    routerSource: result.routing?.routerSource,
    calls,
    trace: result.trace.map((item) => ({
      step: item.step,
      tool: item.action.tool,
      success: item.success,
      resultCount: item.resultCount,
    })),
    answer: result.answer,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
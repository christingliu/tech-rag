import { describe, expect, it, vi } from "vitest";
import { runAgent } from "./agent-controller";

describe("runAgent", () => {
  it("应该允许工具执行并在决策结束时返回答案", async () => {
    const vectorSearch = vi.fn().mockResolvedValue({
      ok: true,
      data: [{ content: "RAG 使用检索结果增强生成" }],
      metadata: { resultCount: 1 },
    });

    let decisions = 0;

    const result = await runAgent("什么是 RAG？", {
      maxSteps: 3,
      tools: {
        vector_search: {
          execute: vectorSearch,
        },
      },
      decide: async () => {
        decisions++;

        if (decisions === 1) {
          return {
            done: false,
            reason: "需要检索知识库",
            action: {
              tool: "vector_search",
              input: { query: "什么是 RAG？" },
              reason: "查询基础定义",
            },
          };
        }

        return {
          done: true,
          answer: "RAG 是检索增强生成。",
          reason: "任务完成",
        };
      },
    });

    expect(result.status).toBe("completed");
    expect(vectorSearch).toHaveBeenCalledTimes(1);
    expect(result.evidence).toHaveLength(1);
    expect(result.trace).toHaveLength(1);
  });

  it("不应该执行未注册的工具", async () => {
    const result = await runAgent("测试", {
      tools: {},
      decide: async () => ({
        done: false,
        reason: "尝试调用工具",
        action: {
          tool: "vector_search",
          input: { query: "测试" },
          reason: "测试白名单",
        },
      }),
    });

    expect(result.status).toBe("failed");
    expect(result.stopReason).toBe("TOOL_NOT_ALLOWED");
  });

  it("应该在达到最大步数后停止", async () => {
    const search = vi.fn().mockResolvedValue({
      ok: true,
      data: [{ content: "结果" }],
      metadata: { resultCount: 1 },
    });

    const result = await runAgent("测试", {
      maxSteps: 2,
      tools: {
        vector_search: { execute: search },
      },
      decide: async () => ({
        done: false,
        reason: "继续检索",
        action: {
          tool: "vector_search",
          input: { query: "测试" },
          reason: "继续查找证据",
        },
      }),
    });

    expect(result.status).toBe("max_steps");
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.trace).toHaveLength(2);
  });
});

import "./env";

import assert from "node:assert/strict";

import {
  runAgent,
  type AgentControllerOptions,
  type AgentToolName,
} from "../lib/agent-controller";
import { decideWithLlm } from "../lib/agent-llm-decider";

async function main() {
  const question =
    "React 的 useState 是什么？请查找它的定义和相关说明。";

  const toolCalls: Array<{
    tool: AgentToolName;
    input: Record<string, unknown>;
    resultCount: number;
  }> = [];

  // 所有工具均使用模拟结果，不访问真实检索服务。
  const tools: AgentControllerOptions["tools"] = {
    graph_search: {
      async execute(input) {
        const resultCount = 0;

        toolCalls.push({
          tool: "graph_search",
          input: { ...input },
          resultCount,
        });

        console.log("[mock] graph_search -> 0 条结果");

        return {
          ok: true,
          data: [],
          metadata: { resultCount },
        };
      },
    },

    entity_lookup: {
      async execute(input) {
        const data = {
          id: "use-state",
          name: "useState",
          type: "api",
        };

        toolCalls.push({
          tool: "entity_lookup",
          input: { ...input },
          resultCount: 1,
        });

        console.log("[mock] entity_lookup -> use-state");

        return {
          ok: true,
          data,
          metadata: { resultCount: 1 },
        };
      },
    },

    keyword_search: {
      async execute(input) {
        const data = [
          {
            id: "chunk-use-state",
            content:
              "React 的 useState 是一个 Hook，用于在函数组件中添加和更新状态。",
            source: "react/hooks.md",
          },
        ];

        toolCalls.push({
          tool: "keyword_search",
          input: { ...input },
          resultCount: data.length,
        });

        console.log("[mock] keyword_search -> 1 条结果");

        return {
          ok: true,
          data,
          metadata: { resultCount: data.length },
        };
      },
    },

    vector_search: {
      async execute(input) {
        const data = [
          {
            id: "chunk-use-state-vector",
            content:
              "useState 返回当前状态和更新状态的函数。",
            source: "react/state.md",
          },
        ];

        toolCalls.push({
          tool: "vector_search",
          input: { ...input },
          resultCount: data.length,
        });

        console.log("[mock] vector_search -> 1 条结果");

        return {
          ok: true,
          data,
          metadata: { resultCount: data.length },
        };
      },
    },
  };

  let decisionCalls = 0;

  // 第一轮固定制造 graph_search 空结果；
  // 后续每一轮均由真实 LLM 决定。
  const decide: AgentControllerOptions["decide"] =
    async (observation) => {
      decisionCalls += 1;

      if (decisionCalls === 1) {
        return {
          done: false,
          reason: "TEST_SETUP_EMPTY_GRAPH_RESULT",
          action: {
            tool: "graph_search",
            input: {
              query: "useState",
              maxHops: 1,
            },
            reason: "测试初始化：模拟图谱检索无结果",
          },
        };
      }

      console.log(
        `\n[LLM] 第 ${decisionCalls} 次决策`,
        {
          lastTool: observation.lastTool,
          evidenceCount: observation.evidence.length,
        },
      );

      return decideWithLlm(observation);
    };

  const result = await runAgent(question, {
    maxSteps: 5,
    tools,
    decide,
  });

  console.log("\n========== 回归测试结果 ==========");
  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Answer:", result.answer);
  console.log("Decision calls:", decisionCalls);
  console.log("Tool calls:", toolCalls);
  console.log("Trace:", JSON.stringify(result.trace, null, 2));
  console.log("Evidence count:", result.evidence.length);

  // 断言 1：第一步必须确实执行了空结果场景。
  assert.equal(toolCalls[0]?.tool, "graph_search");
  assert.equal(toolCalls[0]?.resultCount, 0);

  // 断言 2：至少需要在空结果之后再做一次真实 LLM 决策。
  assert.ok(
    decisionCalls >= 2,
    "空结果后没有再次调用真实 LLM 决策",
  );

  // 断言 3：不能在空结果后原样重复相同工具调用。
  // 这里只检查同一工具、相同参数的重复调用。
  const normalizeInput = (
    input: Record<string, unknown>,
  ) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(input).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    );

  for (let i = 0; i < toolCalls.length; i += 1) {
    for (let j = i + 1; j < toolCalls.length; j += 1) {
      const previous = toolCalls[i];
      const current = toolCalls[j];

      const sameCall =
        previous.tool === current.tool &&
        normalizeInput(previous.input) ===
          normalizeInput(current.input);

      assert.ok(
        !sameCall || previous.resultCount > 0,
        `检测到重复的空结果查询：${current.tool} ${JSON.stringify(current.input)}`,
      );
    }
  }

  // 断言 4：Agent 必须成功结束并且拥有有效证据。
  assert.equal(
    result.status,
    "completed",
    `Agent 未成功完成：${result.stopReason}`,
  );

  assert.ok(
    result.evidence.length > 0,
    "Agent 完成时没有积累证据",
  );

  assert.ok(
    result.answer?.trim(),
    "Agent 没有生成最终答案",
  );

  console.log(
    "\nV9.5.3 多轮真实 LLM 空结果与重复查询回归测试通过",
  );
}

main().catch((error) => {
  console.error("V9.5.3 回归测试失败：", error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";

import {
  runAgent,
  type AgentObservation,
} from "../lib/agent-controller";

async function main() {
  const observations: AgentObservation[] = [];

  let toolCalls = 0;

  const result = await runAgent("测试共享状态", {
    maxSteps: 3,

    tools: {
      vector_search: {
        async execute() {
          toolCalls++;

          return {
            ok: true,
            data: [
              {
                id: "doc-1",
                content: "第一份检索证据",
              },
            ],
            metadata: {
              resultCount: 1,
            },
          };
        },
      },

      keyword_search: {
        async execute() {
          toolCalls++;

          return {
            ok: true,
            data: [
              {
                id: "doc-2",
                content: "第二份检索证据",
              },
            ],
            metadata: {
              resultCount: 1,
            },
          };
        },
      },
    },

    async decide(observation) {
      observations.push(observation);

      if (observation.steps === 0) {
        assert.equal(observation.messages.length, 1);
        assert.equal(observation.messages[0].role, "user");

        return {
          done: false,
          reason: "先执行向量检索",
          action: {
            tool: "vector_search",
            input: {},
            reason: "获取第一份证据",
          },
        };
      }

      if (observation.steps === 1) {
        assert.equal(observation.evidence.length, 1);
        assert.equal(observation.lastTool, "vector_search");

        assert.equal(
          observation.lastToolResult &&
            (
              observation.lastToolResult as {
                ok?: boolean;
              }
            ).ok,
          true,
        );

        assert.ok(
          observation.messages.some(
            (message) =>
              message.role === "tool" &&
              message.toolName === "vector_search",
          ),
        );

        return {
          done: false,
          reason: "再执行关键词检索",
          action: {
            tool: "keyword_search",
            input: {},
            reason: "补充证据",
          },
        };
      }

      assert.equal(observation.steps, 2);
      assert.equal(observation.evidence.length, 2);
      assert.equal(observation.lastTool, "keyword_search");

      const toolMessages = observation.messages.filter(
        (message) => message.role === "tool",
      );

      assert.equal(toolMessages.length, 2);

      // 每个工具结果都应该与对应的调用关联。
      for (const message of toolMessages) {
        assert.ok(message.toolCallId);
        assert.ok(
          observation.messages.some(
            (candidate) =>
              candidate.role === "assistant" &&
              candidate.toolCallId === message.toolCallId,
          ),
        );
      }

      return {
        done: true,
        answer: "已完成两轮检索",
        reason: "证据已足够",
      };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "LLM_FINAL_ANSWER");
  assert.equal(result.evidence.length, 2);
  assert.equal(toolCalls, 2);

  assert.equal(observations.length, 3);

  // 消息历史应随每一轮决策单调增长。
  assert.ok(
    observations[0].messages.length <
      observations[1].messages.length,
  );

  assert.ok(
    observations[1].messages.length <
      observations[2].messages.length,
  );

  assert.equal(result.messages?.[0].role, "user");

  assert.equal(
    result.messages?.filter(
      (message) => message.role === "tool",
    ).length,
    2,
  );

  assert.equal(
    result.messages?.filter(
      (message) =>
        message.role === "assistant" &&
        message.content.includes('"event":"decision"'),
    ).length,
    3,
  );

  console.log("V9.5.3 消息历史与共享状态一致性测试通过");
  console.log("Decision rounds:", observations.length);
  console.log("Tool calls:", toolCalls);
  console.log("result",result);
  console.log("Evidence count:", result.evidence.length);
  console.log("Message count:", result.messages?.length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
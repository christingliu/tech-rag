
import "./env";
import assert from "node:assert/strict";

import { runAgent } from "../lib/agent-controller";
import { createAgentTools } from "../lib/agent-tools";
import { decideWithLlm } from "../lib/agent-llm-decider";

async function main() {
  const question = `
请在知识库中确认 useState 实体，然后根据知识图谱中的显式关系和关联证据，
说明 useState 与 React 的关系。

要求：
1. 不要仅凭实体描述推断关系。
2. 如果 entity_lookup 返回的结果没有显式关系证据，
   请继续调用 graph_search。
3. graph_search 请以 useState 为主要查询实体。
4. 根据实际工具结果决定下一步，不要机械重复检索。
5. 证据足够后再给出最终答案。
`.trim();

  const tools = createAgentTools();
  const decisions: Array<{
    step: number;
    lastTool?: string;
    nextTool?: string;
    done: boolean;
    reason: string;
  }> = [];

  console.log("测试问题：", question);

  const result = await runAgent(question, {
    maxSteps: 4,
    tools,

    async decide(observation) {
      console.log("\n========== LLM 决策 ==========");
      console.log("当前步骤：", observation.steps);
      console.log("上一次工具：", observation.lastTool ?? "无");
      console.log(
        "上一次工具结果：",
        JSON.stringify(observation.lastToolResult ?? null),
      );

      // 每一轮都调用真实 LLM，不预先指定工具。
      const decision = await decideWithLlm(observation);

      decisions.push({
        step: observation.steps + 1,
        lastTool: observation.lastTool,
        nextTool: decision.action?.tool,
        done: decision.done,
        reason: decision.reason,
      });

      console.log("本轮决策：", {
        nextTool: decision.action?.tool ?? "无",
        done: decision.done,
        reason: decision.reason,
      });

      return decision;
    },
  });

  console.log("\n========== 决策历史 ==========");
  console.dir(decisions, { depth: 5 });

  console.log("\n========== 工具执行轨迹 ==========");
  console.dir(
    result.trace.map((item) => ({
      step: item.step,
      tool: item.action.tool,
      input: item.action.input,
      success: item.success,
      resultCount: item.resultCount,
      errorCode: item.errorCode,
      durationMs: item.durationMs,
    })),
    { depth: 5 },
  );

  console.log("\n========== 最终结果 ==========");
  console.log("status:", result.status);
  console.log("stopReason:", result.stopReason);
  console.log("answer:", result.answer);

  const executedTools = result.trace.map(
    (item) => item.action.tool,
  );

  console.log("实际工具调用顺序：", executedTools);

  // 第一项：确认至少有工具被真实执行。
  assert.ok(
    result.trace.length > 0,
    "Agent 没有执行任何工具",
  );

  // 第二项：确认实体查询确实执行成功。
  const entityTrace = result.trace.find(
    (item) => item.action.tool === "entity_lookup",
  );

  assert.ok(
    entityTrace,
    "模型没有调用 entity_lookup；请检查决策历史",
  );

  assert.equal(
    entityTrace.success,
    true,
    "entity_lookup 执行失败",
  );

  // 第三项：确认模型根据实体查询结果继续进行了图谱检索。
  const graphTrace = result.trace.find(
    (item) => item.action.tool === "graph_search",
  );

  assert.ok(
    graphTrace,
    "模型没有继续调用 graph_search；未验证多工具协作",
  );

  assert.equal(
    graphTrace.success,
    true,
    "graph_search 执行失败",
  );

  // 第四项：验证最终结束，而不是仅执行工具后就退出。
  assert.equal(
    result.status,
    "completed",
    `Agent 未正常完成：${result.stopReason}`,
  );

  assert.ok(
    result.answer?.trim(),
    "Agent 没有生成最终答案",
  );

  console.log(
    "\nV9 Tool Calling 2.1 多工具协作测试通过",
  );
}

main().catch((error) => {
  console.error("多工具协作测试失败：", error);
  process.exitCode = 1;
});

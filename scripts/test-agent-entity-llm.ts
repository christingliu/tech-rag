import './env';
import assert from "node:assert/strict";

import {
  runAgent,
  type AgentDecision,
  type AgentObservation,
} from "../lib/agent-controller";
import { createAgentTools } from "../lib/agent-tools";
import { decideWithLlm } from "../lib/agent-llm-decider";

async function main() {
  const question =
    "请查询知识库中名为 useState 的实体，返回它的实体信息。" +
    "这次任务是查找实体本身，不是解释它的用法。";

  const observation: AgentObservation = {
    question,
    steps: 0,
    messages: [{ role: "user", content: question }],
    evidence: [],
  };

  // 直接调用真实 LLM，不预先指定工具。
  const decision: AgentDecision =
    await decideWithLlm(observation);

  console.log("LLM 首轮决策：");
  console.dir(decision, { depth: 6 });

  // 如果模型选择了其他工具，先观察实际决策，
  // 不要把它误判为工具执行代码出错。
  if (decision.action?.tool !== "entity_lookup") {
    console.log(
      "本轮模型没有选择 entity_lookup，需要检查工具描述和提示词。",
    );
    return;
  }

  const tools = createAgentTools();
  let firstDecisionUsed = false;

  const result = await runAgent(question, {
    maxSteps: 3,
    tools,
    async decide(currentObservation) {
      if (!firstDecisionUsed) {
        firstDecisionUsed = true;
        return decision;
      }

      return decideWithLlm(currentObservation);
    },
  });

  console.log("Agent 执行结果：");
  console.dir(result, { depth: 6 });

  const entityTrace = result.trace.find(
    (item) => item.action.tool === "entity_lookup",
  );

  assert.ok(
    entityTrace,
    "Controller 没有执行 entity_lookup",
  );

  assert.equal(
    entityTrace.success,
    true,
    "entity_lookup 执行失败",
  );

  console.log("真实 LLM 的 entity_lookup 选择与执行测试通过");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
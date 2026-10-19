
import "./env";
import { runAgent } from "../lib/agent-controller";
import { createAgentTools } from "../lib/agent-tools";
import { decideWithLlm } from "../lib/agent-llm-decider";

async function main() {
  const question =
    "React 的 useState 和 useEffect 分别解决什么问题？";

  const result = await runAgent(question, {
    maxSteps: 4,
    tools: createAgentTools(),//tools注册
    decide: decideWithLlm,//决策
  });

  console.log("Agent status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Answer:", result.answer);

  console.log(
    "Execution trace:",
    JSON.stringify(result.trace, null, 2),
  );

  console.log(
    "Evidence count:",
    result.evidence.length,
  );
}

main().catch((error) => {
  console.error("Agent run failed:", error);
  process.exitCode = 1;
});
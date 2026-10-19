
import "./env";
import { runAgent } from "../lib/agent-controller";
import { createAgentTools } from "../lib/agent-tools";
import { decideWithLlm } from "../lib/agent-llm-decider";

async function main() {
  const tools = createAgentTools();

  const realVectorSearch = tools.vector_search;

  if (!realVectorSearch) {
    throw new Error("vector_search is not registered");
  }

  // 实验控制：让第一次向量检索返回空结果。
  // 其他工具仍然执行真实检索。
  let firstVectorCall = true;

  tools.vector_search = {
    async execute(input) {
      if (firstVectorCall) {
        firstVectorCall = false;

        return {
          ok: true,
          data: [],
          metadata: { resultCount: 0 },
        };
      }

      return realVectorSearch.execute(input);
    },
  };

  const result = await runAgent(
    "React useState 和 useEffect 分别解决什么问题？请结合知识库证据回答。",
    {
      maxSteps: 4,
      tools,
      decide: decideWithLlm,
    },
  );

  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Answer:", result.answer);
  console.log("Trace:", JSON.stringify(result.trace, null, 2));

  const toolNames = result.trace.map(
    (item) => item.action.tool,
  );

  console.log("Tool sequence:", toolNames);
  console.log(
    "Switched tool:",
    new Set(toolNames).size > 1,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
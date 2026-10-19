
import './env';
import { runAgent } from "../lib/agent-controller";
import { createAgentTools } from "../lib/agent-tools";
import { decideWithLlm } from "../lib/agent-llm-decider";

async function main() {
  const tools = createAgentTools();
  const realVectorSearch = tools.vector_search;

  if (!realVectorSearch) {
    throw new Error("vector_search is not registered");
  }

  // 仅将第一次向量检索模拟为空结果。
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
    "React 的 useState 和 useEffect 分别解决什么问题？请结合知识库证据回答。",
    {
      maxSteps: 4,
      tools,
      decide: decideWithLlm,
    },
  );

  console.log("Status:", result.status);
  console.log("Stop reason:", result.stopReason);
  console.log("Tool sequence:", result.trace.map(
    (item) => item.action.tool,
  ));

  console.log(
    "Trace:",
    JSON.stringify(result.trace, null, 2),
  );

  console.log("Evidence object count:", result.evidence.length);
  console.log("Answer:", result.answer);

  // 第一轮为空结果，第二轮应至少取得一次非空检索结果。
  const hasNonEmptyRetrieval = result.trace.some(
    (item) => item.resultCount !== undefined && item.resultCount > 0,
  );

  console.log(
    "Has non-empty retrieval:",
    hasNonEmptyRetrieval,
  );
}

main().catch((error) => {
  console.error("Multi-step test failed:", error);
  process.exitCode = 1;
});
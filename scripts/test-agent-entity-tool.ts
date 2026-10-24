import "./env";

import assert from "node:assert/strict";
import { createAgentTools } from "../lib/agent-tools";
import { runAgent } from "../lib/agent-controller";

async function main() {
  const tools = createAgentTools();
  const entityLookup = tools.entity_lookup;

  assert.ok(entityLookup, "entity_lookup 应已注册");

  // 1. 命中唯一实体
  const matched = await entityLookup.execute({
    entity: "useState",
    context: "React 中 useState 的作用",
  });

  assert.equal(matched.ok, true);
  assert.equal(matched.metadata?.resultCount, 1);

  const matchedData = matched.data as {
    status: string;
    candidates: Array<{ id: string; name: string }>;
    resolution: { selectedId: string | null } | null;
  };

  assert.equal(matchedData.status, "resolved");
  assert.equal(matchedData.candidates[0]?.id, "use-state");
  assert.equal(matchedData.resolution?.selectedId, "use-state");

  // 2. 未匹配实体
  const missing = await entityLookup.execute({
    entity: "UnknownEntityXYZ",
    context: "查询一个不存在的实体",
  });

  assert.equal(missing.ok, true);
  assert.equal(missing.metadata?.resultCount, 0);

  const missingData = missing.data as {
    status: string;
    candidates: unknown[];
  };

  assert.equal(missingData.status, "no_match");
  assert.equal(missingData.candidates.length, 0);

  // 3. 非法参数：空实体名称
  const invalid = await entityLookup.execute({
    entity: " ",
    context: "",
  });

  assert.equal(invalid.ok, false);
  assert.equal(
    invalid.error?.code,
    "ENTITY_LOOKUP_FAILED",
  );

  // 4. 验证 entity_lookup 可以经由 Controller 执行。
const agentResult = await runAgent(
    "查询 React 中的 useState 实体",
    {
      maxSteps: 2,
      tools,
      decide: async (observation) => {
        if (observation.steps === 0) {
          return {
            done: false,
            action: {
              tool: "entity_lookup",
              input: {
                entity: "useState",
                context: "React 中的 useState",
              },
              reason: "需要确认目标实体",
            },
            reason: "ENTITY_LOOKUP_REQUIRED",
          };
        }
  
        return {
          done: true,
          answer: "已完成实体查询。",
          reason: "ENTITY_LOOKUP_COMPLETED",
        };
      },
    },
  );
  
  assert.equal(agentResult.status, "completed");
  assert.equal(agentResult.trace.length, 1);
  assert.equal(agentResult.trace[0]?.action.tool, "entity_lookup");
  assert.equal(agentResult.trace[0]?.success, true);
  
  console.log("V9 Tool Calling：Controller 集成测试通过");

}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
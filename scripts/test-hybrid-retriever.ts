
import "./env";
import assert from "node:assert/strict";

import {
  retrieveHybrid,
} from "../lib/hybrid-retriever";

async function main() {
  const query =
    "React 的 useEffect 如何处理副作用？";

  const result = await retrieveHybrid(query, {
    vectorTopK: 10,
    scoreThreshold: 0.3,
    maxHops: 1,
  });

  console.log("\n========== Hybrid Retrieval ==========");

  console.log("Query:", result.query);
  console.log("Status:", result.status);

  console.log("\nVector:");
  console.log(result.vector);

  console.log("\nGraph:");
  console.log(result.graph);

  console.log("\nUnified Evidence:");

  for (const item of result.evidence) {
    console.log({
      id: item.id,
      sources: item.sources,
      metadata: item.metadata,
      scores: item.scores,
      graphRelations: item.graphRelations,
      content: item.content,
    });
  }

  console.log("\nSummary:");
  console.log("Total Evidence:", result.evidence.length);

  const uniqueIds = new Set(
    result.evidence.map((item) => item.id),
  );

  assert.equal(
    uniqueIds.size,
    result.evidence.length,
    "Unified Evidence 存在重复 ID",
  );

  for (const item of result.evidence) {
    assert.ok(item.content.trim());
    assert.ok(item.id.startsWith("evidence-"));
  }

  if (result.vector.status === "success") {
    assert.ok(result.vector.resultCount >= 0);
  }

  if (result.graph.status === "success") {
    assert.ok(result.graph.resultCount >= 0);
  }

  assert.notEqual(
    result.status,
    "failed",
    "Vector 和 Graph 两路检索全部失败",
  );

  console.log("\nV9.8.2 Hybrid Retrieval 测试通过");
}

main().catch((error) => {
  console.error("Hybrid Retrieval 测试失败:", error);
  process.exitCode = 1;
});

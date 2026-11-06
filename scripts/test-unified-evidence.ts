import assert from "node:assert/strict";

import {
  createUnifiedEvidenceId,
  fromVectorChunk,
  fromKeywordChunk,
  mergeUnifiedEvidence,
} from "../lib/unified-evidence";

async function main() {
  const metadata = {
    source: "react/hooks.md",
    title: "React Hooks",
    section: "useState",
    chunkIndex: 1,
  };

  // 1. 相同原文位置，ID 必须稳定。
  const id1 = createUnifiedEvidenceId(metadata);
  const id2 = createUnifiedEvidenceId(metadata);
  
  assert.equal(id1, id2);

  // 2. 不同检索方式找到同一个 Chunk。
  const vector = fromVectorChunk({
    ...metadata,
    content: "useState 用于管理组件状态。",
    score: 0.85,
  });

  const keyword = fromKeywordChunk({
    ...metadata,
    content: "useState 用于管理组件状态。",
    keywordScore: 0.75,
  });

  // 3. 合并后只保留一条 Evidence。
  const merged = mergeUnifiedEvidence(
    [vector],
    [keyword],
  );

  assert.equal(merged.length, 1);

  assert.deepEqual(
    merged[0].sources.sort(),
    ["keyword", "vector"],
  );

  assert.equal(merged[0].scores.vector, 0.85);
  assert.equal(merged[0].scores.keyword, 0.75);

  // 4. 相同 ID 但不同内容不能静默合并。
  const conflict = fromVectorChunk({
    ...metadata,
    content: "完全不同的内容",
    score: 0.9,
  });

  assert.throws(
    () => mergeUnifiedEvidence([vector], [conflict]),
    /EVIDENCE_ID_CONTENT_CONFLICT/,
  );

  console.log("V9.8.1 Unified Evidence 基础测试通过");
}

main().catch((error) => {
  console.error("V9.8.1 测试失败:", error);
  process.exitCode = 1;
});
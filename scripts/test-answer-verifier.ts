
import './env';
import assert from "node:assert/strict";

import {
  evaluateVerification,
  normalizeEvidence,
  verifyAnswer,
  type AnswerClaim,
} from "../lib/answer-verifier";

async function main() {
  const rawEvidence = [
    [
      {
        id: "chunk-1",
        content: "useState 是 React Hook，用于在函数组件中添加状态。",
        source: "react/hooks.md",
      },
      {
        id: "chunk-2",
        content: "useEffect 用于在函数组件中处理副作用。",
        source: "react/hooks.md",
      },
    ],
  ];

  const evidence = normalizeEvidence(rawEvidence);
  console.log(evidence,'evidence');
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].id, "chunk-1");

  const input = {
    question: "useState 和 useEffect 分别解决什么问题？",
    answer:
      "useState 用于管理函数组件状态，useEffect 用于处理副作用。",
    evidence,
  };

  // Case 1：答案完全得到证据支持
  const supportedClaims: AnswerClaim[] = [
    {
      id: "claim-1",
      text: "useState 用于管理函数组件状态",
      verdict: "SUPPORTED",
      evidenceIds: ["chunk-1"],
      reason: "证据明确说明 useState 用于添加状态",
    },
    {
      id: "claim-2",
      text: "useEffect 用于处理副作用",
      verdict: "SUPPORTED",
      evidenceIds: ["chunk-2"],
      reason: "证据明确说明 useEffect 用于处理副作用",
    },
  ];

  const passResult = evaluateVerification(
    input,
    supportedClaims,
    "所有结论均有证据支持",
  );

  assert.equal(passResult.verdict, "PASS");
  assert.equal(passResult.supportRatio, 1);
  assert.equal(passResult.issues.length, 0);

  // Case 2：答案包含没有证据支持的结论
  const unsupportedClaims: AnswerClaim[] = [
    ...supportedClaims,
    {
      id: "claim-3",
      text: "useState 可以管理整个应用的全局状态",
      verdict: "UNSUPPORTED",
      evidenceIds: [],
      reason: "现有证据没有说明全局状态管理",
    },
  ];

  const revisionResult = evaluateVerification(
    input,
    unsupportedClaims,
    "存在缺乏证据支持的结论",
  );
  console.log(revisionResult,'revisionResult');
  assert.equal(revisionResult.verdict, "NEEDS_REVISION");
  assert.equal(revisionResult.issues.length, 1);

  // Case 3：答案与证据明确矛盾
  const contradictedClaims: AnswerClaim[] = [
    {
      id: "claim-1",
      text: "useEffect 专门用于管理组件状态",
      verdict: "CONTRADICTED",
      evidenceIds: ["chunk-2"],
      reason: "证据说明 useEffect 用于处理副作用",
    },
  ];

  const rejectResult = evaluateVerification(
    input,
    contradictedClaims,
    "答案与检索证据存在矛盾",
  );

  assert.equal(rejectResult.verdict, "REJECT");

  // Case 4：没有任何证据
  const noEvidenceResult = await verifyAnswer(
    {
      ...input,
      evidence: [],
    },
    async () => {
      throw new Error("没有证据时不应该调用 judge");
    },
  );

  assert.equal(noEvidenceResult.verdict, "REJECT");
  assert.equal(noEvidenceResult.supportRatio, 0);

  console.log("V9.7.1 Answer Verification 测试通过");
  console.log({
    evidenceCount: evidence.length,
    pass: passResult.verdict,
    needsRevision: revisionResult.verdict,
    reject: rejectResult.verdict,
    noEvidence: noEvidenceResult.verdict,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

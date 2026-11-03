
import './env';
import assert from "node:assert/strict";

import {
  decideReflection,
} from "../lib/reflection-decision";

import {
  evaluateVerification,
  type AnswerClaim,
} from "../lib/answer-verifier";

const question = "React 中 useState 和 useEffect 的作用是什么？";

const answer = "useState 管理状态，useEffect 处理副作用。";

const supportedClaim: AnswerClaim = {
  id: "claim-1",
  text: "useState 用于管理组件状态",
  verdict: "SUPPORTED",
  evidenceIds: ["chunk-1"],
  reason: "证据明确支持",
};

const unsupportedClaim: AnswerClaim = {
  id: "claim-2",
  text: "useState 可以管理整个应用的全局状态",
  verdict: "UNSUPPORTED",
  evidenceIds: [],
  reason: "没有证据说明全局状态管理",
};

const contradictedClaim: AnswerClaim = {
  id: "claim-3",
  text: "useEffect 专门用于管理组件状态",
  verdict: "CONTRADICTED",
  evidenceIds: ["chunk-2"],
  reason: "证据明确说明 useEffect 用于处理副作用",
};

function createVerification(claims: AnswerClaim[]) {
  return evaluateVerification(
    {
      question,
      answer,
      evidence: [],
    },
    claims,
    "测试验证结果",
  );
}

function main() {
  // Case 1：验证通过，直接接受
  const pass = decideReflection(
    createVerification([supportedClaim]),
  );

  assert.equal(pass.action, "ACCEPT");

  // Case 2：证据不足，应该补充检索
  const supplement = decideReflection(
    createVerification([
      supportedClaim,
      unsupportedClaim,
    ]),
  );

  assert.equal(
    supplement.action,
    "SUPPLEMENT_RETRIEVAL",
  );

  assert.deepEqual(
    supplement.targetClaims,
    ["claim-2"],
  );

  assert.deepEqual(
    supplement.retrievalQueries,
    [unsupportedClaim.text],
  );

  // Case 3：补充检索次数用完，删除不可靠结论
  const revise = decideReflection(
    createVerification([
      supportedClaim,
      unsupportedClaim,
    ]),
    {
      retrievalAttempts: 2,
      maxRetrievalAttempts: 2,
    },
  );

  assert.equal(revise.action, "REVISE_ANSWER");

  assert.deepEqual(
    revise.retainedClaims.map((claim) => claim.id),
    ["claim-1"],
  );

  // Case 4：出现证据矛盾，先补充检索
  const contradiction = decideReflection(
    createVerification([
      supportedClaim,
      contradictedClaim,
    ]),
  );

  assert.equal(
    contradiction.action,
    "SUPPLEMENT_RETRIEVAL",
  );

  // Case 5：矛盾无法解决，拒绝回答
  const refuse = decideReflection(
    createVerification([
      supportedClaim,
      contradictedClaim,
    ]),
    {
      retrievalAttempts: 2,
      maxRetrievalAttempts: 2,
    },
  );

  assert.equal(refuse.action, "REFUSE");

  // Case 6：没有任何可用结论，拒绝回答
  const noReliableClaim = decideReflection(
    createVerification([unsupportedClaim]),
    {
      retrievalAttempts: 2,
      maxRetrievalAttempts: 2,
    },
  );

  assert.equal(noReliableClaim.action, "REFUSE");

  // Case 7：没有补充检索预算时，直接修正可靠部分
  const noRetry = decideReflection(
    createVerification([
      supportedClaim,
      unsupportedClaim,
    ]),
    {
      retrievalAttempts: 0,
      maxRetrievalAttempts: 0,
    },
  );

  assert.equal(noRetry.action, "REVISE_ANSWER");

  console.log("V9.7.2 Reflection Decision 测试通过");

  console.log({
    pass: pass.action,
    supplement: supplement.action,
    revise: revise.action,
    contradiction: contradiction.action,
    refuse: refuse.action,
    noReliableClaim: noReliableClaim.action,
    noRetry: noRetry.action,
  });
}

main();

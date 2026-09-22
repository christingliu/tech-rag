import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reciprocalRankFusion,
  type HybridDocument,
} from "./hybrid";

const K = 60;

function rrf(rank: number) {
  return 1 / (K + rank + 1);
}

function doc(
  source: string,
  chunkIndex: number,
  extra: Partial<HybridDocument> = {}
): HybridDocument {
  return {
    content: extra.content ?? `${source}#${chunkIndex}`,
    source,
    title: extra.title ?? source,
    section: extra.section ?? "section",
    chunkIndex,
  };
}

describe("reciprocalRankFusion", () => {
  it("returns an empty list when both sides are empty", () => {
    assert.deepEqual(reciprocalRankFusion([], []), []);
  });

  it("scores vector-only results by rank: 1 / (60 + rank + 1)", () => {
    const vector = [doc("a.md", 0), doc("b.md", 0), doc("c.md", 0)];
    const results = reciprocalRankFusion(vector, []);

    assert.equal(results.length, 3);
    assert.equal(results[0].source, "a.md");
    assert.equal(results[1].source, "b.md");
    assert.equal(results[2].source, "c.md");
    assert.equal(results[0].rrfScore, rrf(0));
    assert.equal(results[1].rrfScore, rrf(1));
    assert.equal(results[2].rrfScore, rrf(2));
  });

  it("scores keyword-only results the same way", () => {
    const keyword = [doc("a.md", 0), doc("b.md", 0)];
    const results = reciprocalRankFusion([], keyword);

    assert.equal(results.length, 2);
    assert.equal(results[0].source, "a.md");
    assert.equal(results[0].rrfScore, rrf(0));
    assert.equal(results[1].source, "b.md");
    assert.equal(results[1].rrfScore, rrf(1));
  });

  it("adds RRF scores when the same source:chunkIndex appears on both sides", () => {
    const shared = doc("hooks.md", 0);
    const vectorOnly = doc("state.md", 0);
    const keywordOnly = doc("refs.md", 0);

    const results = reciprocalRankFusion(
      [shared, vectorOnly],
      [shared, keywordOnly]
    );

    assert.equal(results.length, 3);
    assert.equal(results[0].source, "hooks.md");
    assert.equal(results[0].rrfScore, rrf(0) + rrf(0));
    assert.equal(results[1].source, "state.md");
    assert.equal(results[1].rrfScore, rrf(1));
    assert.equal(results[2].source, "refs.md");
    assert.equal(results[2].rrfScore, rrf(1));
  });

  it("keeps the vector document fields when both lists contain the same key", () => {
    const vectorDoc = doc("hooks.md", 0, {
      content: "from vector",
      title: "Vector Title",
    });
    const keywordDoc = doc("hooks.md", 0, {
      content: "from keyword",
      title: "Keyword Title",
    });

    const [result] = reciprocalRankFusion([vectorDoc], [keywordDoc]);

    assert.equal(result.content, "from vector");
    assert.equal(result.title, "Vector Title");
    assert.equal(result.rrfScore, rrf(0) + rrf(0));
  });

  it("treats the same source with different chunkIndex as distinct documents", () => {
    const results = reciprocalRankFusion(
      [doc("hooks.md", 0), doc("hooks.md", 1)],
      []
    );

    assert.equal(results.length, 2);
    assert.equal(results[0].chunkIndex, 0);
    assert.equal(results[1].chunkIndex, 1);
  });

  it("adds scores when the same key appears twice in one list", () => {
    const duplicate = doc("hooks.md", 0);
    const results = reciprocalRankFusion(
      [duplicate, duplicate],
      []
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].rrfScore, rrf(0) + rrf(1));
  });

  it("returns at most `limit` documents after sorting by rrfScore desc", () => {
    const vector = Array.from({ length: 12 }, (_, i) =>
      doc(`doc-${i}.md`, 0)
    );
    const results = reciprocalRankFusion(vector, [], 3);

    assert.equal(results.length, 3);
    assert.deepEqual(
      results.map((item) => item.source),
      ["doc-0.md", "doc-1.md", "doc-2.md"]
    );
  });

  it("defaults limit to 10", () => {
    const vector = Array.from({ length: 15 }, (_, i) =>
      doc(`doc-${i}.md`, 0)
    );
    const results = reciprocalRankFusion(vector, []);

    assert.equal(results.length, 10);
    assert.equal(results[0].source, "doc-0.md");
    assert.equal(results[9].source, "doc-9.md");
  });
});

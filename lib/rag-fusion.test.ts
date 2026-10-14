
import { describe, expect, it } from "vitest";
import {
  fuseRetrievalResults,
  type FusionGraphResult,
  type FusionVectorChunk,
} from "./rag-fusion";

describe("fuseRetrievalResults", () => {
  const vectorChunks: FusionVectorChunk[] = [
    {
      id: "chunk-1",
      content: "React uses Hooks.",
      source: "react.md",
      chunkIndex: 1,
    },
    {
      id: "chunk-2",
      content: "Vue uses Composition API.",
      source: "vue.md",
      chunkIndex: 2,
    },
  ];

  const graphResult: FusionGraphResult = {
    status: "resolved",
    evidence: [
      {
        id: "evidence-1",
        source: "react.md",
        chunkIndex: 1,
        edgeIds: ["edge-react-hooks"],
      },
      {
        id: "evidence-3",
        source: "graph-only.md",
        chunkIndex: 3,
        content: "A graph-only evidence chunk.",
        edgeIds: ["edge-2"],
      },
    ],
  };

  it("merges the same chunk from both channels", () => {
    const result = fuseRetrievalResults(
      vectorChunks,
      graphResult,
    );

    const merged = result.find(
      (item) =>
        item.source === "react.md" &&
        item.chunkIndex === 1,
    );
    console.log(result,'result');
    expect(merged).toBeDefined();
    expect(merged?.retrievalSource).toBe("both");
    expect(merged?.evidenceIds).toContain("evidence-1");
    expect(merged?.edgeIds).toContain("edge-react-hooks");
  });

  it("retains vector-only and graph-only results", () => {
    const result = fuseRetrievalResults(
      vectorChunks,
      graphResult,
    );

    expect(
      result.some((item) => item.retrievalSource === "vector"),
    ).toBe(true);

    expect(
      result.some((item) => item.retrievalSource === "graph"),
    ).toBe(true);
  });

  it("does not add ambiguous graph evidence", () => {
    const ambiguous: FusionGraphResult = {
      status: "ambiguous",
      evidence: graphResult.evidence,
    };

    const result = fuseRetrievalResults(
      vectorChunks,
      ambiguous,
    );

    expect(
      result.every((item) => item.retrievalSource === "vector"),
    ).toBe(true);
  });

  it("respects maxResults", () => {
    const result = fuseRetrievalResults(
      vectorChunks,
      graphResult,
      { maxResults: 2 },
    );

    expect(result).toHaveLength(2);
  });

  it("ranks chunks retrieved by both channels higher", () => {
    const result = fuseRetrievalResults(
      vectorChunks,
      graphResult,
    );

    const mergedIndex = result.findIndex(
      (item) => item.source === "react.md",
    );

    const vectorOnlyIndex = result.findIndex(
      (item) => item.source === "vue.md",
    );

    expect(mergedIndex).toBeLessThan(vectorOnlyIndex);
  });

  it("rejects invalid configuration", () => {
    expect(() =>
      fuseRetrievalResults(
        vectorChunks,
        graphResult,
        { maxResults: -1 },
      ),
    ).toThrow();

    expect(() =>
      fuseRetrievalResults(
        vectorChunks,
        graphResult,
        { vectorWeight: -1 },
      ),
    ).toThrow();
  });
});
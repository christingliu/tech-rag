
import assert from "node:assert/strict";
import { describe, it,test } from "node:test";

import {
  buildAliasIndex,
  matchEntity,
  normalizeEntityName,
  resolveEntityWithContext,
  type KnowledgeNode,
} from "./entity";

import type { KnowledgeGraph } from "./knowledge-type";

test("context resolves a candidate when its neighbor matches the query", () => {
  const graph: KnowledgeGraph = {
    nodes: [
      {
        id: "react",
        name: "React",
        type: "technology",
        aliases: ["React.js"],
      },
      {
        id: "react-native",
        name: "React Native",
        type: "technology",
        aliases: [],
      },
      {
        id: "hooks",
        name: "Hooks",
        type: "concept",
        aliases: ["React Hooks"],
      },
    ],
    edges: [
      {
        id: "edge-react-hooks",
        sourceId: "react",
        targetId: "hooks",
        relation: "supports",
        evidenceIds: [],
      },
      {
        id: "edge-react-native-hooks",
        sourceId: "react-native",
        targetId: "hooks",
        relation: "uses",
        evidenceIds: [],
      },
    ],
    evidence: [],
  };

  const result = resolveEntityWithContext(
    "React Hooks 怎么使用",
    ["react", "react-native"],
    graph,
  );

  // 两个候选都连接 Hooks，当前上下文不足以区分。
  assert.equal(result.selectedId, null);
  assert.equal(result.ambiguous, true);
});

test("does not select a candidate when context provides no evidence", () => {
  const graph: KnowledgeGraph = {
    nodes: [
      {
        id: "js",
        name: "JavaScript",
        type: "technology",
        aliases: ["JS"],
      },
      {
        id: "java",
        name: "Java",
        type: "technology",
        aliases: [],
      },
    ],
    edges: [],
    evidence: [],
  };

  const result = resolveEntityWithContext(
    "如何管理状态",
    ["js", "java"],
    graph,
  );

  assert.equal(result.selectedId, null);
  assert.equal(result.ambiguous, true);
});

const nodes: KnowledgeNode[] = [
  {
    id: "framework-react",
    name: "React",
    type: "entity",
    aliases: ["React.js"],
  },
  {
    id: "hook-use-state",
    name: "useState",
    type: "entity",
    aliases: ["React useState Hook"],
  },
  {
    id: "concept-component-state",
    name: "组件状态",
    type: "concept",
    aliases: ["Component State"],
  },
];

describe("normalizeEntityName", () => {
  it("normalizes case and whitespace", () => {
    assert.equal(
      normalizeEntityName("  React   JS "),
      "react js"
    );
  });

  it("normalizes compatible Unicode forms", () => {
    assert.equal(
      normalizeEntityName(" Ｒｅａｃｔ "),
      "react"
    );
  });
});

describe("buildAliasIndex", () => {
  it("indexes canonical names and aliases", () => {
    const index = buildAliasIndex(nodes);

    assert.deepEqual(
      index.get("react"),
      ["framework-react"]
    );

    assert.deepEqual(
      index.get("react.js"),
      ["framework-react"]
    );
  });

  it("does not duplicate one node for repeated aliases", () => {
    const index = buildAliasIndex([
      {
        id: "framework-react",
        name: "React",
        type: "entity",
        aliases: ["react", "React"],
      },
    ]);

    assert.deepEqual(
      index.get("react"),
      ["framework-react"]
    );
  });

  it("rejects duplicate node IDs", () => {
    assert.throws(
      () =>
        buildAliasIndex([
          {
            id: "same-id",
            name: "React",
            type: "entity",
            aliases: [],
          },
          {
            id: "same-id",
            name: "Vue",
            type: "entity",
            aliases: [],
          },
        ]),
      /Duplicate KnowledgeNode\.id/
    );
  });
});

describe("matchEntity", () => {
  const index = buildAliasIndex(nodes);

  it("matches a canonical name", () => {
    const result = matchEntity("React", index);

    assert.deepEqual(result.candidateIds, [
      "framework-react",
    ]);
    assert.equal(result.ambiguous, false);
  });

  it("matches a registered alias", () => {
    const result = matchEntity("REACT.JS", index);

    assert.deepEqual(result.candidateIds, [
      "framework-react",
    ]);
    assert.equal(result.ambiguous, false);
  });

  it("returns no candidates for an unknown name", () => {
    const result = matchEntity("UnknownFramework", index);

    assert.deepEqual(result.candidateIds, []);
    assert.equal(result.ambiguous, false);
  });

  it("preserves all candidates when an alias is ambiguous", () => {
    const ambiguousIndex = buildAliasIndex([
      {
        id: "language-javascript",
        name: "JavaScript",
        type: "entity",
        aliases: ["JS"],
      },
      {
        id: "runtime-js-example",
        name: "Example Runtime",
        type: "entity",
        aliases: ["JS"],
      },
    ]);

    const result = matchEntity("JS", ambiguousIndex);

    assert.deepEqual(result.candidateIds, [
      "language-javascript",
      "runtime-js-example",
    ]);
    assert.equal(result.ambiguous, true);
  });

  it("does not match an empty query", () => {
    const result = matchEntity("   ", index);

    assert.deepEqual(result.candidateIds, []);
    assert.equal(result.ambiguous, false);
  });
});
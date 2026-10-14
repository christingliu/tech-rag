
import assert from "node:assert/strict";
import test from "node:test";

import {
  retrieveKnowledgeGraph,
  validateKnowledgeGraph,
} from "./rag-knowledge";

import type {
  KnowledgeGraph,
} from "./knowledge-type";

function createGraph(): KnowledgeGraph {
  return {
    nodes: [
      {
        id: "react",
        name: "React",
        type: "technology",
        aliases: ["React.js"],
      },
      {
        id: "use-state",
        name: "useState",
        type: "api",
        aliases: ["state"],
      },
      {
        id: "component-state",
        name: "组件状态",
        type: "concept",
        aliases: ["state"],
      },
      {
        id: "state-management",
        name: "状态管理",
        type: "concept",
        aliases: ["state management"],
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "use-state",
        targetId: "component-state",
        relation: "manages",
        evidenceIds: ["evidence-1"],
      },
      {
        id: "edge-2",
        sourceId: "component-state",
        targetId: "state-management",
        relation: "supports",
        evidenceIds: ["evidence-2"],
      },
      {
        id: "edge-3",
        sourceId: "use-state",
        targetId: "react",
        relation: "belongs_to",
        evidenceIds: ["evidence-3"],
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        source: "hooks.md",
        title: "React Hooks",
        section: "useState",
        chunkIndex: 0,
      },
      {
        id: "evidence-2",
        source: "state.md",
        title: "状态管理",
        section: "组件状态",
        chunkIndex: 1,
      },
      {
        id: "evidence-3",
        source: "hooks.md",
        title: "React Hooks",
        section: "React",
        chunkIndex: 2,
      },
    ],
  };
}

test("无匹配实体时不返回扩展结果", () => {
  const result = retrieveKnowledgeGraph(
    createGraph(),
    "完全不存在的主题",
    2,
  );

  assert.equal(result.matchedNodes.length, 0);
  assert.equal(result.expandedNodes.length, 0);
  assert.equal(result.edges.length, 0);
  assert.equal(result.evidence.length, 0);
});

test("唯一候选只从命中实体开始扩展", () => {
  const result = retrieveKnowledgeGraph(
    createGraph(),
    "useState",
    1,
  );

  assert.deepEqual(
    result.matchedNodes.map((node) => node.id),
    ["use-state"],
  );

  assert.deepEqual(
    result.expandedNodes.map((node) => node.id).sort(),
    ["component-state", "use-state"].sort(),
  );

  assert.deepEqual(
    result.edges.map((edge) => edge.id).sort(),
    ["edge-1", "edge-3"].sort(),
  );

  assert.deepEqual(
    result.evidence.map((item) => item.id).sort(),
    ["evidence-1", "evidence-3"].sort(),
  );
});

test("多跳扩展只返回指定跳数内的节点和边", () => {
  const result = retrieveKnowledgeGraph(
    createGraph(),
    "useState",
    2,
  );

  assert.equal(result.matchedNodes.length, 1);

  assert.deepEqual(
    result.expandedNodes.map((node) => node.id).sort(),
    [
      "use-state",
      "component-state",
      "state-management",
      "react",
    ].sort(),
  );

  assert.deepEqual(
    result.edges.map((edge) => edge.id).sort(),
    ["edge-1", "edge-2", "edge-3"].sort(),
  );

  assert.deepEqual(
    result.evidence.map((item) => item.id).sort(),
    ["evidence-1", "evidence-2", "evidence-3"].sort(),
  );
});

test("歧义未解决时保留候选，但不得扩展图谱", () => {
  const result = retrieveKnowledgeGraph(
    createGraph(),
    "state",
    2,
  );

  assert.equal(result.matchedNodes.length, 2);
  assert.equal(result.expandedNodes.length, 0);
  assert.equal(result.edges.length, 0);
  assert.equal(result.evidence.length, 0);
});

test("引用不存在的 Evidence 时校验失败", () => {
  const graph = createGraph();

  graph.edges[0].evidenceIds = ["missing-evidence"];

  const errors = validateKnowledgeGraph(graph);

  assert.ok(
    errors.some((error) =>
      error.includes("missing-evidence"),
    ),
  );

  assert.throws(
    () => retrieveKnowledgeGraph(graph, "useState", 1),
    /KnowledgeGraph 校验失败/,
  );
});

test("非法 maxHops 被拒绝", () => {
  assert.throws(
    () => retrieveKnowledgeGraph(createGraph(), "useState", -1),
    /maxHops/,
  );

  assert.throws(
    () => retrieveKnowledgeGraph(createGraph(), "useState", 1.5),
    /maxHops/,
  );
});
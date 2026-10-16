
import { buildGraphContext } from "@/lib/graph-context";

const context = buildGraphContext(
  {
    query: "React 中状态更新后为什么会重新渲染？",
    nodes: [
      {
        id: "react-state",
        name: "State",
        type: "concept",
        description: "组件用于保存状态的数据机制",
      },
      {
        id: "react-render",
        name: "Rendering",
        type: "concept",
        description: "React 根据组件输入计算 UI 的过程",
      },
    ],
    edges: [
      {
        id: "edge-state-render",
        sourceId: "react-state",
        targetId: "react-render",
        relation: "triggers",
        evidenceIds: ["ev-state"],
      },
    ],
    paths: [
      {
        nodeIds: ["react-state", "react-render"],
        edgeIds: ["edge-state-render"],
        relations: ["triggers"],
      },
    ],
    evidence: [
      {
        id: "ev-state",
        text: "当组件状态发生变化时，React 会安排组件重新渲染。",
        source: "knowledge/react/state.md",
        title: "State",
        section: "State updates",
      },
    ],
  },
  {
    maxChars: 3000,
    includeDescriptions: true,
    includeRelations: true,
    includePaths: true,
    includeEvidence: true,
  },
);

console.log(context.text);
console.log({
  charCount: context.charCount,
  truncated: context.truncated,
  evidenceIds: context.includedEvidenceIds,
});
import { keywordSearch } from "../lib/keyword";

const docs = [
  {
    content: "useState 是 React 的状态 Hook，用于管理组件内部状态",
    source: "hooks.md",
    title: "React Hooks",
    section: "useState",
    chunkIndex: 0,
  },
  {
    content: "useEffect 用于处理副作用，如订阅和定时器",
    source: "hooks.md",
    title: "React Hooks",
    section: "useEffect",
    chunkIndex: 1,
  },
  {
    content: "状态管理方案有 Redux、Zustand、Jotai",
    source: "state.md",
    title: "状态管理",
    section: "Redux",
    chunkIndex: 0,
  },
];
// 测试 keywordSearch ,v3.3的版本
// 期望结果：
// 1. 状态管理方案有 Redux、Zustand、Jotai
// 2. useState 是 React 的状态 Hook，用于管理组件内部状态
// 3. useEffect 用于处理副作用，如订阅和定时器
/* const results = keywordSearch("useState 状态管理", docs);

console.log("命中数量:", results.length);
for (const r of results) {
  console.log(`\n[score=${r.keywordScore.toFixed(2)}] ${r.title} / ${r.section}`);
  console.log("  ", r.content);
} */
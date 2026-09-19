# React Performance

React 性能优化的核心：
减少不必要的渲染，缩短单次渲染耗时。

## 找出性能问题

先测量，再优化。

React DevTools 的 Profiler 可以记录
每次组件渲染的原因和耗时，
火焰图中颜色越深渲染越慢。

避免凭感觉优化，
先定位真正拖慢页面的组件。

## 减少不必要的渲染

常见手段有三种。

用 React.memo 跳过 props 没变的组件渲染。

把状态拆小：
频繁变化的状态放在小组件里，
不要放在页面顶层，否则整棵树跟着重渲染。

用 useMemo 和 useCallback
保持 props 引用稳定，
让 memo 的子组件能真正跳过渲染。

## 列表 key

渲染列表时必须提供稳定且唯一的 key。

key 帮助 React 识别哪些元素变了、
哪些可以复用。

不要用数组下标做 key，
尤其在列表会排序、插入、删除时，
下标 key 会导致状态错乱和多余的 DOM 操作。

## 懒加载

React.lazy 配合 Suspense 可以按需加载组件，
把不常用或体积大的组件拆成单独的 chunk。

```jsx
const Chart = React.lazy(() => import("./Chart"));

<Suspense fallback={<p>加载中</p>}>
  <Chart />
</Suspense>
```

首屏用不到的组件延迟加载，
可以明显缩短首屏时间。

## 状态组织

把"会变的"和"不会变的"分开，
把"全局的"和"局部的"分开。

状态离使用它的组件越近越好，
避免大对象整体下发给多层子组件。

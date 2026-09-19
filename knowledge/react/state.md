# React State

State 是组件内部保存的、会随时间变化的数据。
State 变化会触发组件重新渲染。

## useState

useState 接收初始值，返回一个数组：
第一项是当前状态，第二项是更新函数。

```jsx
const [count, setCount] = useState(0);
```

调用 setCount 更新状态并触发重新渲染。

不要直接修改状态变量，
必须通过更新函数修改，
否则 React 感知不到变化。

## 基于前值更新

新的状态依赖旧状态时，
应该传函数给更新函数。

```jsx
setCount(prev => prev + 1);
```

因为状态更新可能被批量处理，
直接写 setCount(count + 1) 多次调用时，
每次读到的 count 都可能是同一个旧值。

## 批量更新

React 会把一次事件处理函数中的多次状态更新
合并成一次重新渲染，这叫批量更新。

```jsx
function handleClick() {
  setCount(1);
  setName("Alice");
  // 两个更新合并，组件只渲染一次
}
```

## 状态提升

多个组件需要共享同一份数据时，
把状态放到它们最近的公共父组件中，
再通过 props 分发下去。

这叫状态提升，是 React 中共享状态的基础方式。

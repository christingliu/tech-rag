# React Memo

React 提供了三个缓存工具：
React.memo、useMemo、useCallback，
用来跳过不必要的计算和渲染。

## React.memo

React.memo 包裹组件后，
只有 props 变化时组件才重新渲染。

```jsx
const UserList = React.memo(function UserList(props) {
  return <ul>{props.users.map(...)}</ul>;
});
```

对 props 浅比较相同则跳过渲染，
适合渲染开销大、props 稳定的组件。

## useMemo

useMemo 缓存计算结果，
依赖不变时直接返回上次的值。

```jsx
const sorted = useMemo(
  () => [...list].sort(cmp),
  [list]
);
```

适合缓存开销大的计算，
或者需要保持引用稳定的对象。

## useCallback

useCallback 缓存函数本身，
依赖不变时返回同一个函数引用。

```jsx
const handleDelete = useCallback((id) => {
  setUsers(prev => prev.filter(u => u.id !== id));
}, []);
```

主要用途：
把回调传给被 memo 的子组件时，
避免每次渲染都生成新函数导致 memo 失效。

## 使用原则

缓存本身也有成本，
不要给所有组件和函数都加 memo。

正确的顺序是：
先让数据结构和状态组织得更合理，
再用 Profiler 定位真正慢的组件，
最后才对它们做针对性缓存。

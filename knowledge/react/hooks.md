# React Hooks

React Hooks 是 React 16.8 引入的一组 API，
允许函数组件使用 state、effect 等 React 能力。

## useState

useState 用于在函数组件中保存状态。

例如：

const [count, setCount] = useState(0);

调用 setCount 可以更新状态，并触发组件重新渲染。

## useEffect

useEffect 用于处理副作用。

常见场景包括：

- 请求数据
- 订阅事件
- 操作浏览器 API
- 与外部系统同步

useEffect 接收一个函数作为参数。

如果这个函数返回另一个函数，
那么返回的函数就是 cleanup function。

cleanup 通常用于清理副作用，
例如取消订阅、清除定时器等。

React 会在 effect 重新执行之前执行上一次 effect 的 cleanup，
并且在组件卸载时执行 cleanup。

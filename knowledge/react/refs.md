# React Refs

Ref 用来保存一个不需要触发渲染的值，
最常见的用途是访问 DOM 元素。

## useRef

useRef 返回一个对象，包含 current 属性。

```jsx
const inputRef = useRef(null);
```

把 ref 挂到 JSX 元素上，
current 就会指向对应的 DOM 节点。

```jsx
<input ref={inputRef} />

inputRef.current.focus();
```

## ref 不触发重渲染

ref 与 state 的核心区别：
修改 ref.current 不会触发组件重新渲染。

因此 ref 适合保存两类数据：
DOM 引用，以及不参与渲染的临时值，
例如定时器 id、上一次的值。

渲染过程需要用到的数据放 state，
渲染过程之外的数据放 ref。

## 读写时机

不要在渲染期间读写 ref.current，
渲染期间组件应该是纯函数。

读取或修改 ref.current 应该放在
事件处理函数或 useEffect 中。

## forwardRef

函数组件默认不能接收 ref。

需要把 ref 转发给内部 DOM 时，
使用 forwardRef 包裹组件。

```jsx
const Input = forwardRef((props, ref) => (
  <input ref={ref} {...props} />
));
```

React 19 之后函数组件可以直接把 ref
作为 props 接收，不再必须用 forwardRef。

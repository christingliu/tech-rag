# React Props

Props 是父组件传给子组件的数据，
类似函数的参数，让同一个组件展示不同内容。

## 传递与读取

父组件在 JSX 上写属性，子组件通过 props 对象读取。

```jsx
function User(props) {
  return <p>{props.name}，{props.age} 岁</p>;
}

<User name="Alice" age={18} />
```

字符串直接写，表达式和数字需要用花括号。

## children

写在组件标签中间的内容，
会作为 props.children 传给子组件。

```jsx
function Card(props) {
  return <div>{props.children}</div>;
}

<Card>
  <p>这里是内容</p>
</Card>
```

children 让组件可以包裹任意内容，
常用于布局类组件。

## Props 是只读的

组件不能修改自己的 props。

React 遵循单向数据流：
数据从父组件流向子组件，
子组件想改变父组件的数据，
只能调用父组件传下来的回调函数。

```jsx
function Counter(props) {
  return <button onClick={props.onAdd}>加一</button>;
}
```

## 默认值

props 可以设置默认值，
当父组件没有传该属性时使用默认值。

```jsx
function Button({ label = "确定" }) {
  return <button>{label}</button>;
}
```

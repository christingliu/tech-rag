# React Components

React 应用由组件组成。组件是可复用的 UI 单元，
接收输入并返回描述界面的 React Element。

## 函数组件

函数组件是普通的 JavaScript 函数。

函数名必须以大写字母开头，
接收 props 作为参数，返回 JSX。

```jsx
function Button(props) {
  return <button>{props.label}</button>;
}
```

使用方式与 HTML 标签类似：

```jsx
<Button label="提交" />
```

## 组件组合

组件可以嵌套使用，形成组件树。

父组件渲染子组件，子组件也可以继续组合更小的组件。

```jsx
function Card(props) {
  return (
    <div>
      <h2>{props.title}</h2>
      {props.children}
    </div>
  );
}
```

组合是 React 的核心思想：
用小组件搭出复杂界面，而不是写一个巨大的组件。

## 组件划分原则

划分组件时通常参考两个依据。

按职责划分：一个组件只负责一件事，
例如 Button 只管按钮，Modal 只管弹窗。

按复用划分：同样的 UI 出现两次以上，
就应该抽成组件，通过 props 传入不同的数据。

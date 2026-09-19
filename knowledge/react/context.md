# React Context

Context 提供了一种跨组件传递数据的方式，
不需要一层层通过 props 传递。

## createContext

createContext 创建一个 Context 对象，
可以传入默认值。

```jsx
const ThemeContext = createContext("light");
```

## Provider 与 useContext

Provider 组件负责提供数据，
它包裹的所有子组件都能读取该数据。

```jsx
<ThemeContext.Provider value="dark">
  <App />
</ThemeContext.Provider>
```

任意深度的子组件用 useContext 读取。

```jsx
const theme = useContext(ThemeContext);
```

Context 值变化时，
所有消费该 Context 的组件都会重新渲染。

## 适用场景

Context 适合存放全局性质的数据，
例如主题、当前登录用户、语言配置。

这类数据的特点是：
许多组件都需要读，但很少变化。

## 注意事项

Context 不是状态管理工具，
它只解决"传递"问题，不解决"更新"问题。

不要把频繁变化的数据放进 Context，
否则大量消费组件会跟着频繁重渲染。

传递路径上只有一两层时，
优先使用 props，Context 是备选方案。

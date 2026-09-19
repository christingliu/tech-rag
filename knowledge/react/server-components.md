# React Server Components

Server Components 是在服务端执行的组件，
只在服务端运行一次，
把渲染结果发送给浏览器。

## 与客户端组件的区别

传统组件会打包进 JS 发给浏览器，
在浏览器中渲染，可以交互、可以用 state。

Server Components 在服务端渲染成静态内容，
不参与浏览器端的水合过程。

Server Components 中不能使用
useState、useEffect、事件处理等浏览器能力。

## "use client"

需要交互的组件在文件顶部
添加 "use client" 声明，
该文件及其引入的组件成为客户端组件。

```jsx
"use client";

import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

没有声明的组件默认是 Server Components。

## 组合方式

推荐的结构：
页面用 Server Components 获取数据，
把交互部分拆成小的客户端组件。

Server Components 可以直接访问数据库和文件系统，
并且支持 async/await 写法。

```jsx
async function UserList() {
  const users = await db.users.find();
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

## 优势

Server Components 的主要收益：

发送给浏览器的 JS 变少，
组件逻辑留在服务端执行。

数据获取更简单，
不需要在 useEffect 中请求接口，
服务端直接拿到数据再渲染。

敏感信息如 API Key 不进入浏览器代码。

# React Rendering

React 的渲染过程会根据组件状态和 props 的变化，
计算需要更新的 UI。

函数组件执行之后会产生 React Element。

React 会根据新的 Element Tree 和之前的结果进行比较，
然后更新真实 DOM。

状态更新通常会触发组件重新渲染。

重新渲染并不意味着整个页面都会被重新创建，
React 会通过协调过程确定需要更新的部分。
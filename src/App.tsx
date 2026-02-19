import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>MingziApp</h1>
      <div className="card">
        <button onClick={() => setCount((c) => c + 1)}>count is {count}</button>
        <p>
          这是 MingziApp 的互动计数器示例，编辑 <code>src/App.tsx</code> 即可看到热更新效果。
        </p>
      </div>
      <p className="read-the-docs">点击上方 Logo 查看 Vite / React 文档</p>
    </>
  )
}

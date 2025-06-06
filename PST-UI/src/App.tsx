import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { ethers } from "ethers";
import abi from '../public/abi/PST.json';

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <header
        style={{
          width: '100%',
          padding: '1rem',
          display: 'flex',
          justifyContent: 'flex-end',
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: 1000,
        }}
      >
        <w3m-button />
      </header>

      <main style={{ marginTop: '80px', textAlign: 'center' }}>
        <div>
          <a href="https://vite.dev" target="_blank">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1>Vite + React</h1>
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
      </main>
    </>
  )
}

export default App

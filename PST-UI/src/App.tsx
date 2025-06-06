import { useState } from 'react'
import './App.css'
import { ethers } from "ethers";
import abi from '../public/abi/PST.json';

function App() {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'history'>('send')

  return (
    <>
      {/* Wallet Connect Header - unified dark color */}
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
          background: '#1e1e1e', // same as content
          borderBottom: '1px solid #333'
        }}
      >
        <w3m-button />
      </header>

      {/* Main UI */}
      <main
        style={{
          paddingTop: '120px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: '#fff'
        }}
      >
        {/* Tab Buttons - same dark background */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem',
            position: 'fixed',
            top: '64px',
            background: '#1e1e1e', // match content
            padding: '1rem',
            width: '100%',
            justifyContent: 'center',
            zIndex: 999,
            borderBottom: '1px solid #333'
          }}
        >
          <button
            onClick={() => setActiveTab('send')}
            style={{
              backgroundColor: activeTab === 'send' ? '#4CAF50' : '#1e1e1e',
              color: activeTab === 'send' ? '#fff' : '#ccc',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            SEND
          </button>
          <button
            onClick={() => setActiveTab('receive')}
            style={{
              backgroundColor: activeTab === 'receive' ? '#2196F3' : '#1e1e1e',
              color: activeTab === 'receive' ? '#fff' : '#ccc',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            RECEIVE
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              backgroundColor: activeTab === 'history' ? '#FF9800' : '#1e1e1e',
              color: activeTab === 'history' ? '#fff' : '#ccc',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            HISTORY
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          {activeTab === 'send' && <p>This is the SEND view</p>}
          {activeTab === 'receive' && <p>This is the RECEIVE view</p>}
          {activeTab === 'history' && <p>This is the HISTORY view</p>}
        </div>
      </main>
    </>
  )
}

export default App

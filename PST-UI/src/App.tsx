// src/App.tsx
import { useState } from 'react';
import './App.css';
import CreateTransfer from './components/CreateTransfers/CreateTransfers';
import ClaimTransfers from './components/ClaimTransfers/ClaimTransfers';
import History from './components/History/History';

// Define heights for fixed elements 
const FIXED_WALLET_HEADER_HEIGHT = '70px';
const FIXED_BUTTON_BAR_HEIGHT = '70px';
const TOTAL_FIXED_HEADER_HEIGHT = `calc(${FIXED_WALLET_HEADER_HEIGHT} + ${FIXED_BUTTON_BAR_HEIGHT})`;

function App() {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'history'>('send');

  return (
    <div className="app-container">
      <header className="app-header-fixed">
        <w3m-button />
      </header>

      <div
        className="app-nav-buttons-fixed"
        style={{
          top: FIXED_WALLET_HEADER_HEIGHT,
        }}
      >
        <button
          onClick={() => setActiveTab('send')}
          className="header-button-style"
          style={{
            backgroundColor: activeTab === 'send' ? '#2196F3' : '#1e1e1e',
            color: activeTab === 'send' ? '#fff' : '#ccc',
          }}
        >
          SEND
        </button>
        <button
          onClick={() => setActiveTab('receive')}
          className="header-button-style"
          style={{
            backgroundColor: activeTab === 'receive' ? '#4CAF50' : '#1e1e1e',
            color: activeTab === 'receive' ? '#fff' : '#ccc',
          }}
        >
          CLAIM
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className="header-button-style"
          style={{
            backgroundColor: activeTab === 'history' ? '#FF9800' : '#1e1e1e',
            color: activeTab === 'history' ? '#fff' : '#ccc',
          }}
        >
          HISTORY
        </button>
      </div>

      <div
        className="app-spacer-div"
        style={{
          height: TOTAL_FIXED_HEADER_HEIGHT,
        }}
      ></div>

      <main className="app-main-content">
        <div className="app-main-content-inner-wrapper">
          {activeTab === 'send' && <CreateTransfer />}
          {activeTab === 'receive' && <ClaimTransfers />}
          {activeTab === 'history' && <History />}
        </div>
      </main>
    </div>
  );
}

export default App;

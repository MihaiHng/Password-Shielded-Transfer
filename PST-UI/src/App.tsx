// import { useState } from 'react'
// import './App.css'
// import CreateTransfer from './components/CreateTransfers';
// import ClaimTransfers from './components/ClaimTransfers';
// import History from './components/History';
// import { headerButtonStyle } from './styles/buttonStyles'

// function App() {
//   const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'history'>('send')

//   return (
//     <>
//       {/* Wallet Connect Header - unified dark color */}
//       <header
//         style={{
//           width: '100%',
//           padding: '1rem',
//           display: 'flex',
//           justifyContent: 'flex-end',
//           position: 'fixed',
//           top: 0,
//           right: 0,
//           zIndex: 1000,
//           background: '#1e1e1e', // same as content
//           borderBottom: 'none'
//         }}
//       >
//         <w3m-button />
//       </header>

//       {/* Main UI */}
//       <main
//         style={{
//           paddingTop: '120px',
//           display: 'flex',
//           flexDirection: 'column',
//           alignItems: 'center',
//           color: '#fff'
//         }}
//       >
//         {/* Tab Buttons - same dark background */}
//         <div
//           style={{
//             display: 'flex',
//             gap: '5rem',
//             marginBottom: '2rem',
//             position: 'fixed',
//             top: '64px',
//             background: '#1e1e1e', // match content
//             padding: '1rem',
//             width: '100%',
//             justifyContent: 'center',
//             zIndex: 999,
//             borderBottom: '1px solid #1e1e1e'
//           }}
//         >
//           <button
//             onClick={() => setActiveTab('send')}
//             style={{
//               ...headerButtonStyle,
//               backgroundColor: activeTab === 'send' ? '#2196F3' : '#1e1e1e',
//               color: activeTab === 'send' ? '#fff' : '#ccc',
//             }}
//           >
//             SEND
//           </button>
//           <button
//             onClick={() => setActiveTab('receive')}
//             style={{
//               ...headerButtonStyle,
//               backgroundColor: activeTab === 'receive' ? '#4CAF50' : '#1e1e1e',
//               color: activeTab === 'receive' ? '#fff' : '#ccc',
//             }}
//           >
//             CLAIM
//           </button>
//           <button
//             onClick={() => setActiveTab('history')}
//             style={{
//               ...headerButtonStyle,
//               backgroundColor: activeTab === 'history' ? '#FF9800' : '#1e1e1e',
//               color: activeTab === 'history' ? '#fff' : '#ccc',
//             }}
//           >
//             HISTORY
//           </button>
//         </div>

//         {/* Tab Content */}
//         <div style={{ textAlign: 'center', marginTop: '3rem' }}>
//           {activeTab === 'send' && <CreateTransfer />}
//           {activeTab === 'receive' && <ClaimTransfers />}
//           {activeTab === 'history' && <History />}
//         </div>
//       </main>
//     </>
//   )
// }

// export default App


// src/App.tsx

import { useState } from 'react'
import './App.css'
import CreateTransfer from './components/CreateTransfers/CreateTransfers';
import ClaimTransfers from './components/ClaimTransfers/ClaimTransfers';
import History from './components/History/History';
import { headerButtonStyle } from './styles/buttonStyles'

const FIXED_WALLET_HEADER_HEIGHT = '72px';

function App() {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'history'>('send')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#1e1e1e',
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
      }}
    >
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
          background: '#1e1e1e',
          borderBottom: 'none',
          boxSizing: 'border-box',
        }}
      >
        <w3m-button />
      </header>

      <div style={{ height: FIXED_WALLET_HEADER_HEIGHT, flexShrink: 0 }}></div>

      {/* CORRECTED LINE IS HERE */}
      <div
        style={{
          display: 'flex',
          gap: '5rem',
          background: '#1e1e1e',
          padding: '1rem',
          width: '100%',
          justifyContent: 'center',
          zIndex: 999,
          boxSizing: 'border-box', // <--- CORRECTED THIS LINE
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setActiveTab('send')}
          style={{
            ...headerButtonStyle,
            backgroundColor: activeTab === 'send' ? '#2196F3' : '#1e1e1e',
            color: activeTab === 'send' ? '#fff' : '#ccc',
          }}
        >
          SEND
        </button>
        <button
          onClick={() => setActiveTab('receive')}
          style={{
            ...headerButtonStyle,
            backgroundColor: activeTab === 'receive' ? '#4CAF50' : '#1e1e1e',
            color: activeTab === 'receive' ? '#fff' : '#ccc',
          }}
        >
          CLAIM
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            ...headerButtonStyle,
            backgroundColor: activeTab === 'history' ? '#FF9800' : '#1e1e1e',
            color: activeTab === 'history' ? '#fff' : '#ccc',
          }}
        >
          HISTORY
        </button>
      </div>

      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexGrow: 1,
          overflowY: 'auto',
          padding: '2rem 0',
          width: '100%',
          boxSizing: 'border-box',
          paddingBottom: '2rem',
        }}
      >
        <div style={{ width: '100%', maxWidth: '1000px', padding: '0 20px', boxSizing: 'border-box' }}>
          {activeTab === 'send' && <CreateTransfer />}
          {activeTab === 'receive' && <ClaimTransfers />}
          {activeTab === 'history' && <History />}
        </div>
      </main>
    </div>
  )
}

export default App

// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.tsx'
// import { WagmiProvider } from 'wagmi'
// import { wagmiConfig } from './web3/web3modal'


// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <WagmiProvider config={wagmiConfig}>
//       <App />
//     </WagmiProvider>
//   </StrictMode>,
// )

// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { AppKitProvider } from '@reown/appkit';
import { appKitConfig } from './lib/appkit';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={appKitConfig.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppKitProvider config={appKitConfig}>
          <App />
        </AppKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);







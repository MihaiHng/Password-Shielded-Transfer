import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { mainnet, polygon, arbitrum } from 'wagmi/chains'
import { WagmiConfig } from 'wagmi'

// 1. Set up chains
const chains = [mainnet, polygon, arbitrum]

// 2. Your project ID (from https://cloud.walletconnect.com)
export const projectId = 'YOUR_PROJECT_ID'

// 3. Create wagmi config using ethers
export const wagmiConfig = defaultWagmiConfig({
    chains,
    projectId,
    metadata: {
        name: 'My DApp',
        description: 'My Web3 App using Web3Modal + Ethers',
        url: 'http://localhost:5173', // your app URL
        icons: ['https://yourdomain.com/logo.png'], // optional
    }
})

// 4. Create Web3Modal
createWeb3Modal({
    wagmiConfig,
    projectId,
    chains,
    themeMode: 'light', // or 'dark'
})

// src/lib/appkit.ts

import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { sepolia, zksyncSepoliaTestnet } from '@reown/appkit/networks'
import { QueryClient } from '@tanstack/react-query'
import { http } from 'wagmi' // Import http from wagmi

// 0. Setup queryClient
export const queryClient = new QueryClient()

// 1. Get projectId from https://cloud.reown.com
const projectId = import.meta.env.VITE_APPKIT_PROJECT_ID

// 2. Create a metadata object - optional
export const metadata = {
    name: 'PST',
    description: 'Password Shielded Transfer UI',
    url: 'https://yourdomain.com',
    icons: ['https://yourdomain.com/icon.png'],
}

// 3. Define the base networks imported from @reown/appkit/networks
// These are the network objects AppKit expects for its `networks` prop
export const baseNetworks = [sepolia, zksyncSepoliaTestnet]

// Define explicit RPC URLs using your Alchemy API Key
// Ensure VITE_ALCHEMY_API_KEY is correctly set in your .env
const alchemySepoliaUrl = `https://eth-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`;
const alchemyZkSyncSepoliaUrl = `https://zksync-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`;

// 4. Create Wagmi Adapter and configure transports explicitly
export const wagmiAdapter = new WagmiAdapter({
    // Pass the base networks to the adapter.
    // The adapter internally uses these to create the wagmi config.
    networks: baseNetworks,
    // This is where you override the default RPCs for wagmi config
    // The keys must be the chain IDs
    transports: {
        [sepolia.id]: http(alchemySepoliaUrl),
        [zksyncSepoliaTestnet.id]: http(alchemyZkSyncSepoliaUrl),
    },
    projectId,
    ssr: true,
    // customRpcUrls: {} // This map is for AppKit's own internal usage/display, not directly for wagmi transports
})

// 5. Create and export the AppKit instance
export const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks: [sepolia, zksyncSepoliaTestnet], // Use the original AppKitNetwork objects here
    defaultNetwork: sepolia, // Use the original AppKitNetwork object for default
    projectId,
    metadata,
    features: { analytics: true },
    themeMode: 'dark',
    // customRpcUrls // No need to pass customRpcUrls here if configured in adapter transports
})





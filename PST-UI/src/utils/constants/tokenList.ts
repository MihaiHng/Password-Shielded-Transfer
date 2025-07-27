// src/lib/constants/tokenList.ts

import ethLogo from '../../assets/token_logo/eth-logo.png';


interface TokenInfo {
    name: string;
    symbol: string;
    address: `0x${string}`; // Viem's address type
    decimals: number;
    logoURI?: string;
    isNative?: boolean; // To identify native currency (ETH on Ethereum, ETH on zkSync)
}

interface NetworkTokens {
    chainId: number;
    chainName: string;
    tokens: TokenInfo[];
}

export const SEPOLIA_TOKENS: TokenInfo[] = [
    {
        name: "Ethereum",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000", // Native ETH on Sepolia
        decimals: 18,
        isNative: true,
        logoURI: ethLogo
    },
    {
        name: "Wrapped Ether",
        symbol: "WETH",
        address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // Sepolia WETH 
        decimals: 18,
        logoURI: ethLogo
    },
    {
        name: "USD Coin",
        symbol: "USDC",
        address: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", // Sepolia USDC 
        decimals: 6,
        logoURI: "https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    },
    {
        name: "Chainlink Token",
        symbol: "LINK",
        address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", // Sepolia LINK 
        decimals: 18,
        logoURI: "https://repository-images.githubusercontent.com/111455867/9c7f5a80-65c7-11e9-85cf-2f1eb28e2c89"
    },
    // Add more Sepolia tokens here
];

// Placeholder for zkSync Sepolia. **YOU MUST REPLACE THESE WITH ACTUAL ZKSYNC SEPOLIA TOKEN ADDRESSES**
// ZkSync Era's native token is also ETH, typically with address(0).
export const ZKSYNC_SEPOLIA_TOKENS: TokenInfo[] = [
    {
        name: "zkSync Era ETH",
        symbol: "ETH",
        address: "0x0000000000000000000000000000000000000000", // Native ETH on zkSync Era Sepolia
        decimals: 18,
        isNative: true,
        logoURI: "https://www.citypng.com/public/uploads/preview/ethereum-eth-round-logo-icon-png-701751694969815akblwl2552.png"
    },
    {
        name: "zkSync Era WETH",
        symbol: "WETH",
        address: "0x000000000000000000000000000000000000800A", // Native ETH on zkSync Era Sepolia
        decimals: 18,
        isNative: true,
        logoURI: "https://holder.io/wp-content/uploads/coins/h/weth.png"
    },
    {
        name: "zkSync USDC",
        symbol: "USDC",
        address: "0xAe045DE5638162fa134807Cb558E15A3F5A7F853",
        decimals: 6,
        logoURI: "https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    },
    {
        name: "zkSync LINK",
        symbol: "LINK",
        address: "0x23A1aFD896c8c8876AF46aDc38521f4432658d1e",
        decimals: 18,
        logoURI: "https://repository-images.githubusercontent.com/111455867/9c7f5a80-65c7-11e9-85cf-2f1eb28e2c89"
    }
    // Add more zkSync Sepolia tokens here 
];

// Centralized mapping for easy access
export const ALL_NETWORK_TOKENS: NetworkTokens[] = [
    {
        chainId: 11155111, // Sepolia Chain ID
        chainName: "Sepolia Ethereum",
        tokens: SEPOLIA_TOKENS,
    },
    {
        chainId: 300, // zkSync Era Sepolia Testnet Chain ID (as of current knowledge, verify if changed)
        chainName: "zkSync Sepolia Testnet",
        tokens: ZKSYNC_SEPOLIA_TOKENS,
    },
    // Add more networks as needed (e.g., zkSync Era Mainnet)
    // {
    //   chainId: 324, // zkSync Era Mainnet Chain ID
    //   chainName: "zkSync Era Mainnet",
    //   tokens: ZKSYNC_ERA_MAINNET_TOKENS, // You'd define this list separately
    // },
];


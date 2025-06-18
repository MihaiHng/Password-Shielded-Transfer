// // src/components/CreateTransfer.tsx

// import React, { useState, useEffect } from 'react';
// import {
//     useWriteContract,
//     useWaitForTransactionReceipt,
//     useAccount,
//     useReadContract // Added for checking allowance
// } from 'wagmi';
// import { parseUnits, isAddress, formatUnits } from 'viem';
// import type { Abi, Address } from 'viem';

// // Import your ABIs
// import abiPstWrapper from '../lib/abis/abi_pst.json';
// import erc20AbiJson from '../lib/abis/abi_erc20.json';

// // Import your pre-approved tokens list
// import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList';

// import { formButtonStyle } from '../styles/buttonStyles';

// const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
// const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

// // Define your contract address for the PSTWrapper (this will vary by network)
// const PST_CONTRACT_ADDRESS_SEPOLIA: Address = "0xYourPSTContractAddressOnSepolia"; // REPLACE THIS
// const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA: Address = "0xYourPSTContractAddressOnZkSyncSepolia"; // REPLACE THIS

// // Helper to get the correct PST contract address for the current chain
// const getPSTContractAddress = (chainId: number | undefined): Address | undefined => {
//     switch (chainId) {
//         case 11155111: return PST_CONTRACT_ADDRESS_SEPOLIA;
//         case 300: return PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA;
//         // Add more cases for other networks (e.g., 324 for zkSync Era Mainnet)
//         default: return undefined;
//     }
// };

// const CreateTransfer: React.FC = () => {
//     const { address: userAddress, chain, isConnected } = useAccount();

//     const [recipientAddress, setRecipientAddress] = useState<string>('');
//     const [amount, setAmount] = useState<string>('');
//     const [password, setPassword] = useState<string>('');

//     const [currentNetworkTokens, setCurrentNetworkTokens] = useState(
//         ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id)?.tokens || []
//     );

//     const [selectedToken, setSelectedToken] = useState<typeof currentNetworkTokens[0] | undefined>(
//         currentNetworkTokens[0]
//     );

//     // Wagmi hooks for contract interaction
//     const { writeContract: writePSTContract, data: pstHash, isPending: isPSTWritePending, error: pstWriteError } = useWriteContract();
//     const { writeContract: writeERC20Contract, data: erc20Hash, isPending: isERC20WritePending, error: erc20WriteError } = useWriteContract();

//     // Watch for either transaction hash
//     const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
//         hash: pstHash || erc20Hash,
//     });

//     const isPending = isPSTWritePending || isERC20WritePending;

//     // Get the PST contract address for the current chain
//     const pstContractAddress = getPSTContractAddress(chain?.id);

//     // --- Read Contract Allowance ---
//     const { data, refetch: refetchAllowance } = useReadContract({
//         address: selectedToken && !selectedToken.isNative ? selectedToken.address : undefined,
//         abi: ERC20_CONTRACT_ABI,
//         functionName: 'allowance',
//         args: userAddress && pstContractAddress ? [userAddress, pstContractAddress] : undefined,
//         chainId: chain?.id,
//         query: {
//             enabled: !!userAddress && !!selectedToken && !selectedToken.isNative && !!pstContractAddress,
//             staleTime: 5000,
//         },
//     });

//     // Explicitly cast 'data' to bigint (or undefined) AFTER it's been destructured, if its type is still unknown
//     const allowance: bigint = (data as bigint | undefined) || 0n;

//     // --- State for required amount (including fees) ---
//     // Note: Your contract calculates totalTransferCost internally.
//     // To show 'needed approval', we'd ideally get this from the contract.
//     // For simplicity, for now, we'll assume the approval needed is just the `amount` the user inputs
//     // or a very large amount. A real dApp might call a view function on PST contract to get `totalTransferCost`.
//     const parsedAmount = amount ? parseUnits(amount, selectedToken?.decimals || 18) : 0n;
//     const isAllowanceSufficient = selectedToken?.isNative || allowance >= parsedAmount; // For simplicity, assumes amount needs to be approved. Real `totalTransferCost` is better.


//     useEffect(() => {
//         if (chain) {
//             const tokensForChain = ALL_NETWORK_TOKENS.find(net => net.chainId === chain.id)?.tokens || [];
//             setCurrentNetworkTokens(tokensForChain);
//             setSelectedToken(prevToken => {
//                 if (prevToken && tokensForChain.some(t => t.address === prevToken.address)) {
//                     return prevToken;
//                 }
//                 return tokensForChain[0];
//             });
//         } else {
//             setCurrentNetworkTokens([]);
//             setSelectedToken(undefined);
//         }
//     }, [chain]);

//     // Refetch allowance when selected token or user address changes
//     useEffect(() => {
//         if (userAddress && selectedToken && pstContractAddress && !selectedToken.isNative) {
//             refetchAllowance();
//         }
//     }, [userAddress, selectedToken, pstContractAddress, refetchAllowance]);


//     const handleTokenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
//         const selectedAddress = e.target.value as Address;
//         const token = currentNetworkTokens.find(t => t.address === selectedAddress);
//         setSelectedToken(token);
//     };

//     const handleApprove = async () => {
//         if (!isConnected || !userAddress || !selectedToken || selectedToken.isNative || !pstContractAddress || !amount) {
//             alert('Please connect wallet, select an ERC-20 token, and enter an amount to approve.');
//             return;
//         }
//         if (parseFloat(amount) <= 0) {
//             alert('Amount to approve must be greater than zero.');
//             return;
//         }

//         try {
//             const amountToApprove = parseUnits(amount, selectedToken.decimals);
//             // It's common to approve a very large number (max uint256) to avoid repeated approvals
//             // const maxUint256 = 2n**256n - 1n; // For infinite approval

//             writeERC20Contract({
//                 address: selectedToken.address, // The token contract
//                 abi: ERC20_CONTRACT_ABI,
//                 functionName: 'approve',
//                 args: [pstContractAddress, amountToApprove], // Approve PST contract for the specified amount
//                 chainId: chain?.id,
//             });
//         } catch (e) {
//             console.error("Error during approval setup:", e);
//             alert(`Approval failed: ${e instanceof Error ? e.message : String(e)}`);
//         }
//     };


//     const handleTransfer = async () => {
//         if (!isConnected) {
//             alert('Please connect your wallet to perform a transfer.');
//             return;
//         }
//         if (!selectedToken || !recipientAddress || !amount || !password || !isAddress(recipientAddress)) {
//             alert('Please fill all fields, including password, and select a valid token and recipient address.');
//             return;
//         }
//         if (parseFloat(amount) <= 0) {
//             alert('Amount must be greater than zero.');
//             return;
//         }
//         if (!pstContractAddress) {
//             alert('PST contract address not found for the current network.');
//             return;
//         }
//         if (!selectedToken.isNative && !isAllowanceSufficient) {
//             alert(`Insufficient allowance for ${selectedToken.symbol}. Please approve the PST contract first.`);
//             return;
//         }


//         try {
//             const parsedAmountForPST = parseUnits(amount, selectedToken.decimals);

//             // Call the `createTransfer` function on your PST contract
//             writePSTContract({
//                 address: pstContractAddress,
//                 abi: PST_CONTRACT_ABI,
//                 functionName: 'createTransfer',
//                 args: [
//                     recipientAddress,
//                     selectedToken.address, // Pass the token address (0x0 for native ETH)
//                     parsedAmountForPST,
//                     password
//                 ],
//                 chainId: chain?.id,
//                 value: selectedToken.isNative ? parsedAmountForPST : undefined, // Attach ETH if native token is selected
//             });

//         } catch (e) {
//             console.error("Error during transfer setup:", e);
//             alert(`Transfer failed: ${e instanceof Error ? e.message : String(e)}`);
//         }
//     };

//     const getExplorerUrl = (txHash: Address | undefined) => {
//         if (!txHash || !chain) return '#';
//         switch (chain.id) {
//             case 11155111: return `https://sepolia.etherscan.io/tx/${txHash}`;
//             case 300: return `https://sepolia.explorer.zksync.io/tx/${txHash}`;
//             default: return `#`;
//         }
//     };

//     // Determine which hash to display/watch
//     const transactionHashToWatch = pstHash || erc20Hash;
//     const transactionError = pstWriteError || erc20WriteError || confirmError;

//     return (
//         <div>
//             <h2>Create Token Transfer</h2>

//             {isConnected && chain ? (
//                 <p>
//                     Connected to: <strong>{chain.name}</strong>
//                 </p>
//             ) : (
//                 <p>Please connect your wallet.</p>
//             )}

//             {currentNetworkTokens.length > 0 ? (
//                 <div>
//                     <label htmlFor="token-select">Select Token:</label>
//                     <select
//                         id="token-select"
//                         value={selectedToken?.address || ''}
//                         onChange={handleTokenChange}
//                         style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
//                     >
//                         {currentNetworkTokens.map((token) => (
//                             <option key={token.address} value={token.address}>
//                                 {token.name} ({token.symbol}) {token.isNative ? '(Native)' : ''}
//                             </option>
//                         ))}
//                     </select>
//                 </div>
//             ) : (
//                 <p>No tokens available for the currently connected network. Please switch networks in your wallet.</p>
//             )}

//             <div>
//                 <label htmlFor="recipient-address">Recipient Address:</label>
//                 <input
//                     id="recipient-address"
//                     type="text"
//                     value={recipientAddress}
//                     onChange={(e) => setRecipientAddress(e.target.value)}
//                     placeholder="0x..."
//                     style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
//                 />
//             </div>

//             <div>
//                 <label htmlFor="amount">Amount ({selectedToken?.symbol || 'Token'}):</label>
//                 <input
//                     id="amount"
//                     type="number"
//                     value={amount}
//                     onChange={(e) => setAmount(e.target.value)}
//                     placeholder="0.0"
//                     min="0"
//                     step="any"
//                     style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
//                 />
//             </div>

//             {/* Password Field */}
//             <div>
//                 <label htmlFor="password">Password:</label>
//                 <input
//                     id="password"
//                     type="password"
//                     value={password}
//                     onChange={(e) => setPassword(e.target.value)}
//                     placeholder="Enter password"
//                     style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
//                 />
//             </div>

//             {/* Approval Section for ERC-20 Tokens */}
//             {selectedToken && !selectedToken.isNative && isConnected && amount && parseFloat(amount) > 0 && (
//                 <div style={{ marginTop: '15px', marginBottom: '15px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
//                     <p>
//                         Current Allowance to PST Contract: {formatUnits(allowance, selectedToken.decimals)} {selectedToken.symbol}
//                     </p>
//                     {!isAllowanceSufficient && (
//                         <p style={{ color: 'orange', fontWeight: 'bold' }}>
//                             Approval needed: You need to approve at least {amount} {selectedToken.symbol} for the PST Contract.
//                         </p>
//                     )}
//                     <button
//                         onClick={handleApprove}
//                         disabled={isERC20WritePending || isConfirming || !isConnected || isAllowanceSufficient}
//                         style={{ ...formButtonStyle, background: isAllowanceSufficient ? '#4CAF50' : '#007bff' }}
//                     >
//                         {isERC20WritePending ? 'Approving...' : isAllowanceSufficient ? 'Approved!' : 'Approve PST Contract'}
//                     </button>
//                 </div>
//             )}

//             <button
//                 onClick={handleTransfer}
//                 disabled={
//                     isPending ||
//                     isConfirming ||
//                     !selectedToken ||
//                     !isAddress(recipientAddress) ||
//                     !amount ||
//                     parseFloat(amount) <= 0 ||
//                     !password ||
//                     !isConnected ||
//                     !chain ||
//                     (!selectedToken.isNative && !isAllowanceSufficient) // Disable if ERC-20 and not approved
//                 }
//                 style={formButtonStyle}
//             >
//                 {isPending ? 'Confirming...' : isConfirming ? 'Transferring...' : 'Create Transfer'}
//             </button>

//             {transactionHashToWatch ? (
//                 <p>Transaction Hash: <a href={getExplorerUrl(transactionHashToWatch)} target="_blank" rel="noopener noreferrer">{transactionHashToWatch}</a></p>
//             ) : null}
//             {isConfirming && <p>Waiting for confirmation...</p>}
//             {isConfirmed && <p>Transaction confirmed!</p>}
//             {transactionError && <p>Error: {transactionError.message}</p>}
//         </div>
//     );
// };




// src/components/CreateTransfer.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useAccount,
    useReadContract
} from 'wagmi';
import { parseUnits, isAddress, formatUnits } from 'viem';
import type { Abi, Address } from 'viem';

// Import your ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import your pre-approved tokens list
import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList';

// Import React's CSSProperties type
import type { CSSProperties } from 'react'; // <--- ADD THIS IMPORT

// --- ALL STYLE DEFINITIONS GO HERE (BEFORE THE COMPONENT) ---
const formButtonStyle: CSSProperties = { // Add type annotation
    width: '100%',
    padding: '16px 20px',
    borderRadius: '20px',
    border: 'none',
    background: 'linear-gradient(to right, #ff007a, #9900ff)',
    color: 'white',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    marginTop: '20px',
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.2)',
};

const disabledButtonStyle: CSSProperties = { // Add type annotation
    ...formButtonStyle,
    background: '#E0E0E0',
    cursor: 'not-allowed',
    boxShadow: 'none',
};

const uniswapCardStyle: CSSProperties = { // Add type annotation
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '480px',
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const cardTitleStyle: CSSProperties = { // Add type annotation
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const connectedNetworkStyle: CSSProperties = { // Add type annotation
    fontSize: '14px',
    color: '#aaa',
    textAlign: 'center',
    marginBottom: '20px',
};

const disconnectedNetworkStyle: CSSProperties = { // Add type annotation
    ...connectedNetworkStyle,
    color: 'red',
};

const inputGroupStyle: CSSProperties = { // Add type annotation
    background: '#2c2c2c',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
};

const amountAndCostWrapperStyle: CSSProperties = { // Add type annotation
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
};

const amountInputStyle: CSSProperties = { // <--- KEY FIX: Add type annotation here
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '48px',
    fontWeight: 'bold',
    width: '100%',
    padding: '0',
    WebkitAppearance: 'none',
    MozAppearance: 'textfield',
    appearance: 'none',
};

const totalCostStyle: CSSProperties = { // Add type annotation
    fontSize: '14px',
    color: '#aaa',
    marginTop: '8px',
    textAlign: 'left',
    width: '100%',
};

const tokenSelectContainerStyle: CSSProperties = { // Add type annotation
    position: 'absolute',
    top: '16px',
    right: '16px',
    zIndex: 10,
};

const tokenSelectButtonStyle: CSSProperties = { // Add type annotation
    background: 'rgba(50, 50, 50, 0.7)',
    borderRadius: '16px',
    padding: '8px 12px',
    border: 'none',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background 0.2s ease',
    // You can't use '&:hover' in inline styles. This will be ignored by React.
    // If you need hover effects, you'd typically use a CSS file, styled-components,
    // or handle with onMouseEnter/onMouseLeave for more complex logic.
};

const tokenButtonContentStyle: CSSProperties = { // Add type annotation
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const tokenLogoStyle: CSSProperties = { // Add type annotation
    width: '24px',
    height: '24px',
    borderRadius: '50%',
};

const tokenSymbolStyle: CSSProperties = { // Add type annotation
    fontSize: '18px',
    fontWeight: 'bold',
};

const dropdownArrowStyle: CSSProperties = { // Add type annotation
    marginLeft: '4px',
    fontSize: '12px',
    transform: 'translateY(-1px)',
};

const tokenDropdownMenuStyle: CSSProperties = { // Add type annotation
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: '0',
    background: '#2c2c2c',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    maxHeight: '200px',
    overflowY: 'auto',
    zIndex: 100,
    minWidth: '240px',
};

const tokenDropdownItemStyle: CSSProperties = { // Add type annotation
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    cursor: 'pointer',
    // Can't use '&:hover' in inline styles.
};

const tokenAddressStyle: CSSProperties = { // Add type annotation
    fontSize: '12px',
    color: '#888',
    fontFamily: 'monospace',
};

const copyButtonStyle: CSSProperties = { // Add type annotation
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
    borderRadius: '4px',
    marginLeft: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
    // Can't use '&:hover' in inline styles.
};

const fieldContainerStyle: CSSProperties = { // Add type annotation
    marginBottom: '20px',
    background: '#2c2c2c',
    borderRadius: '16px',
    padding: '16px',
};

const labelStyle: CSSProperties = { // Add type annotation
    display: 'block',
    fontSize: '14px',
    color: '#aaa',
    marginBottom: '8px',
};

const inputFieldStyle: CSSProperties = { // Add type annotation
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
    // Can't use '&:focus' in inline styles.
};

const approvalSectionStyle: CSSProperties = { // Add type annotation
    background: 'rgba(0, 123, 255, 0.1)',
    border: '1px solid #007bff',
    borderRadius: '16px',
    padding: '16px',
    marginTop: '20px',
    marginBottom: '20px',
    textAlign: 'center',
};

const approvalTextStyle: CSSProperties = { // Add type annotation
    fontSize: '14px',
    color: '#ccc',
    marginBottom: '10px',
};

const transactionStatusStyle: CSSProperties = { // Add type annotation
    fontSize: '12px',
    color: '#ccc',
    marginTop: '15px',
    textAlign: 'center',
};

const linkStyle: CSSProperties = { // Add type annotation
    color: '#9900ff',
    textDecoration: 'none',
    // Can't use '&:hover' in inline styles.
};

// Type assertions for ABIs
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

// Define your contract address for the PSTWrapper (this will vary by network)
const PST_CONTRACT_ADDRESS_SEPOLIA = import.meta.env.VITE_PST_ETH_SEPOLIA_ADDRESS as `0x${string}`;
const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA = import.meta.env.VITE_PST_ZKSYNC_SEPOLIA_ADDRESS as `0x${string}`;

const getPSTContractAddress = (chainId: number | undefined): Address | undefined => {
    switch (chainId) {
        case 11155111: return PST_CONTRACT_ADDRESS_SEPOLIA;
        case 300: return PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA;
        default: return undefined;
    }
};

// --- Frontend Calculation for Total Transfer Cost (Replicating Solidity Logic) ---
interface TransferFee {
    lvlOne: bigint;
    lvlTwo: bigint;
    lvlThree: bigint;
}

function selectTransferFee(
    _amount: bigint,
    s_limitLevelOne: bigint,
    s_limitLevelTwo: bigint,
    transferFees: TransferFee
): bigint {
    if (_amount <= s_limitLevelOne) {
        return transferFees.lvlOne;
    } else if (_amount <= s_limitLevelTwo) {
        return transferFees.lvlTwo;
    } else {
        return transferFees.lvlThree;
    }
}

function calculateTotalTransferCostFrontend(
    amount: bigint,
    s_limitLevelOne: bigint,
    s_limitLevelTwo: bigint,
    s_feeScalingFactor: bigint,
    transferFees: TransferFee
): { totalTransferCost: bigint; transferFeeCost: bigint } {
    const _transferFee = selectTransferFee(amount, s_limitLevelOne, s_limitLevelTwo, transferFees);
    const _transferFeeCost = (amount * _transferFee) / s_feeScalingFactor;
    const _totalTransferCost = amount + _transferFeeCost;

    return { totalTransferCost: _totalTransferCost, transferFeeCost: _transferFeeCost };
}

// --- UTILITY FUNCTIONS ---
const truncateAddress = (address: string): string => {
    if (!address || address.length < 10) return address; // Handles short or invalid addresses
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// --- MAIN REACT COMPONENT STARTS HERE ---
const CreateTransfer: React.FC = () => {
    const { address: userAddress, chain, isConnected } = useAccount();

    const [recipientAddress, setRecipientAddress] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [showTokenDropdown, setShowTokenDropdown] = useState<boolean>(false);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null); // New state for copy feedback

    const tokenDropdownRef = useRef<HTMLDivElement>(null);

    const [currentNetworkTokens, setCurrentNetworkTokens] = useState(
        ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id)?.tokens || []
    );
    const [selectedToken, setSelectedToken] = useState<typeof currentNetworkTokens[0] | undefined>(
        currentNetworkTokens[0]
    );

    const { writeContract: writePSTContract, data: pstHash, isPending: isPSTWritePending, error: pstWriteError } = useWriteContract();
    const { writeContract: writeERC20Contract, data: erc20Hash, isPending: isERC20WritePending, error: erc20WriteError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
        hash: pstHash || erc20Hash,
    });

    const isPending = isPSTWritePending || isERC20WritePending;

    const pstContractAddress = getPSTContractAddress(chain?.id);

    const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
        address: selectedToken && !selectedToken.isNative ? selectedToken.address : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'allowance',
        args: userAddress && pstContractAddress ? [userAddress, pstContractAddress] : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!selectedToken && !selectedToken.isNative && !!pstContractAddress,
            staleTime: 5000,
        },
    });
    const allowance: bigint = (rawAllowance as bigint | undefined) || 0n;

    const { data: sLimitLevelOne = 0n } = useReadContract({
        address: pstContractAddress, abi: PST_CONTRACT_ABI, functionName: 's_limitLevelOne', chainId: chain?.id, query: { enabled: !!pstContractAddress }
    }) as { data?: bigint };
    const { data: sLimitLevelTwo = 0n } = useReadContract({
        address: pstContractAddress, abi: PST_CONTRACT_ABI, functionName: 's_limitLevelTwo', chainId: chain?.id, query: { enabled: !!pstContractAddress }
    }) as { data?: bigint };
    const { data: sFeeScalingFactor = 0n } = useReadContract({
        address: pstContractAddress, abi: PST_CONTRACT_ABI, functionName: 's_feeScalingFactor', chainId: chain?.id, query: { enabled: !!pstContractAddress }
    }) as { data?: bigint };

    const { data: contractTransferFees, isLoading: isLoadingTransferFees } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getTransferFees',
        chainId: chain?.id,
        query: { enabled: !!pstContractAddress }
    });

    const transferFees: TransferFee = {
        lvlOne: (contractTransferFees as any)?.lvlOne || 0n,
        lvlTwo: (contractTransferFees as any)?.lvlTwo || 0n,
        lvlThree: (contractTransferFees as any)?.lvlThree || 0n,
    };


    const parsedAmountForCalculation = amount && selectedToken ? parseUnits(amount, selectedToken.decimals) : 0n;

    // const { totalTransferCost, transferFeeCost } =
    //     sLimitLevelOne > 0n &&
    //         sLimitLevelTwo > 0n &&
    //         sFeeScalingFactor > 0n &&
    //         transferFees.lvlOne >= 0n && transferFees.lvlTwo >= 0n && transferFees.lvlThree >= 0n &&
    //         selectedToken?.decimals !== undefined &&
    //         amount && parseFloat(amount) > 0 &&
    //         !isLoadingTransferFees
    //         ? calculateTotalTransferCostFrontend(
    //             parsedAmountForCalculation,
    //             sLimitLevelOne,
    //             sLimitLevelTwo,
    //             sFeeScalingFactor,
    //             transferFees
    //         )
    //         : { totalTransferCost: 0n, transferFeeCost: 0n };

    // const formattedTotalTransferCost = selectedToken ? formatUnits(totalTransferCost, selectedToken.decimals) : '0';

    const { totalTransferCost, transferFeeCost } =
        sLimitLevelOne > 0n &&
            sLimitLevelTwo > 0n &&
            sFeeScalingFactor > 0n &&
            transferFees.lvlOne >= 0n && transferFees.lvlTwo >= 0n && transferFees.lvlThree >= 0n &&
            selectedToken?.decimals !== undefined &&
            !isLoadingTransferFees // Ensure fee parameters are loaded
            ? calculateTotalTransferCostFrontend(
                parsedAmountForCalculation, // This will be 0n if 'amount' is 0 or empty, correctly calculating 0 cost
                sLimitLevelOne,
                sLimitLevelTwo,
                sFeeScalingFactor,
                transferFees
            )
            : { totalTransferCost: 0n, transferFeeCost: 0n }; // Fallback if contract params aren't ready

    const formattedTotalTransferCost = selectedToken ? formatUnits(totalTransferCost, selectedToken.decimals) : '0';

    const isAllowanceSufficient = selectedToken?.isNative || allowance >= totalTransferCost;


    useEffect(() => {
        if (chain) {
            const tokensForChain = ALL_NETWORK_TOKENS.find(net => net.chainId === chain.id)?.tokens || [];
            setCurrentNetworkTokens(tokensForChain);
            setSelectedToken(prevToken => {
                if (prevToken && tokensForChain.some(t => t.address === prevToken.address)) {
                    return prevToken;
                }
                return tokensForChain[0];
            });
        } else {
            setCurrentNetworkTokens([]);
            setSelectedToken(undefined);
        }
    }, [chain]);

    useEffect(() => {
        if (userAddress && selectedToken && pstContractAddress && !selectedToken.isNative) {
            refetchAllowance();
        }
    }, [userAddress, selectedToken, pstContractAddress, refetchAllowance, amount]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(event.target as Node)) {
                setShowTokenDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);


    const handleTokenSelect = (token: typeof currentNetworkTokens[0]) => {
        setSelectedToken(token);
        setShowTokenDropdown(false);
    };

    const handleCopyAddress = async (address: string) => {
        try {
            await navigator.clipboard.writeText(address);
            setCopiedAddress(address); // Set the address that was copied
            setTimeout(() => {
                setCopiedAddress(null); // Clear feedback after 1.5 seconds
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy address. Please try again.'); // Fallback
        }
    };


    const handleApprove = async () => {
        if (!isConnected || !userAddress || !selectedToken || selectedToken.isNative || !pstContractAddress || !amount) {
            alert('Please connect wallet, select an ERC-20 token, and enter an amount to approve.');
            return;
        }
        if (parseFloat(amount) <= 0) {
            alert('Amount to approve must be greater than zero.');
            return;
        }

        try {
            writeERC20Contract({
                address: selectedToken.address,
                abi: ERC20_CONTRACT_ABI,
                functionName: 'approve',
                args: [pstContractAddress, totalTransferCost],
                chainId: chain?.id,
            });
        } catch (e) {
            console.error("Error during approval setup:", e);
            alert(`Approval failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleTransfer = async () => {
        if (!isConnected) {
            alert('Please connect your wallet to perform a transfer.');
            return;
        }
        if (!selectedToken || !recipientAddress || !amount || !password || !isAddress(recipientAddress)) {
            alert('Please fill all fields, including password, and select a valid token and recipient address.');
            return;
        }
        if (parseFloat(amount) <= 0) {
            alert('Amount must be greater than zero.');
            return;
        }
        if (!pstContractAddress) {
            alert('PST contract address not found for the current network.');
            return;
        }
        if (!selectedToken.isNative && !isAllowanceSufficient) {
            alert(`Insufficient allowance for ${selectedToken.symbol}. Please approve the PST contract for the total transfer cost first.`);
            return;
        }
        if (sFeeScalingFactor === 0n || sLimitLevelOne === 0n || sLimitLevelTwo === 0n ||
            isLoadingTransferFees || transferFees.lvlOne < 0n || transferFees.lvlTwo < 0n || transferFees.lvlThree < 0n) {
            alert('Contract configuration (fee parameters) not fully loaded or invalid. Please wait or refresh.');
            return;
        }

        try {
            writePSTContract({
                address: pstContractAddress,
                abi: PST_CONTRACT_ABI,
                functionName: 'createTransfer',
                args: [
                    recipientAddress,
                    selectedToken.address,
                    parsedAmountForCalculation,
                    password
                ],
                chainId: chain?.id,
                value: selectedToken.isNative ? totalTransferCost : undefined,
            });

        } catch (e) {
            console.error("Error during transfer setup:", e);
            alert(`Transfer failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const getExplorerUrl = (txHash: Address | undefined) => {
        if (!txHash || !chain) return '#';
        switch (chain.id) {
            case 11155111: return `https://sepolia.etherscan.io/tx/${txHash}`;
            case 300: return `https://sepolia.explorer.zksync.io/tx/${txHash}`;
            default: return `#`;
        }
    };

    const transactionHashToWatch = pstHash || erc20Hash;
    const transactionError = pstWriteError || erc20WriteError || confirmError;

    // Effect to clear password when transaction is confirmed
    useEffect(() => {
        if (isConfirmed) {
            setPassword(''); // Clear the password field
            // Optionally, you might want to clear other fields here too, e.g., setAmount(''), setRecipientAddress('')
        }
    }, [isConfirmed]); // Dependency array: run this effect whenever isConfirmed changes

    return (
        <div style={uniswapCardStyle}>
            <h2 style={cardTitleStyle}>Create Token Transfer</h2>

            {isConnected && chain ? (
                <p style={connectedNetworkStyle}>
                    Connected to: <strong>{chain.name}</strong> (Chain ID: {chain.id})
                </p>
            ) : (
                <p style={disconnectedNetworkStyle}>Please connect your wallet.</p>
            )}

            {/* Input/Dropdown Group - Mimicking Uniswap's main input area */}
            <div style={inputGroupStyle}>
                {/* NEW: Wrapper for Amount and Total Cost */}
                <div style={amountAndCostWrapperStyle}>
                    {/* Amount Input (Big) */}
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        min="0"
                        step="any"
                        style={amountInputStyle}
                    />
                    <p style={totalCostStyle}>
                        Total transfer cost:{" "}
                        {selectedToken // Always show symbol if toen is selected, otherwikse N/A
                            ? `${formattedTotalTransferCost} ${selectedToken.symbol}`
                            : `0.00 N/A`}
                    </p>
                </div>

                {/* Custom Token Dropdown - Positioned absolutely relative to inputGroupStyle */}
                <div style={tokenSelectContainerStyle} ref={tokenDropdownRef}>
                    <button
                        onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                        style={tokenSelectButtonStyle}
                        disabled={!currentNetworkTokens.length}
                    >
                        {selectedToken ? (
                            <div style={tokenButtonContentStyle}>
                                {selectedToken.logoURI && <img src={selectedToken.logoURI} alt={selectedToken.symbol} style={tokenLogoStyle} />}
                                <span style={tokenSymbolStyle}>{selectedToken.symbol}</span>
                                {/* REMOVED: tokenNameStyle from here */}
                                {/* <span style={tokenNameStyle}>{selectedToken.name}</span> */}
                                <span style={dropdownArrowStyle}>▼</span>
                            </div>
                        ) : (
                            'Select Token ▼'
                        )}
                    </button>

                    {showTokenDropdown && currentNetworkTokens.length > 0 && (
                        <div style={tokenDropdownMenuStyle}>
                            {currentNetworkTokens.map((token) => (
                                // Use a React.Fragment or a div to wrap, so onClick can still select the token
                                <div
                                    key={token.address}
                                    onClick={() => handleTokenSelect(token)} // This selects the token
                                    style={tokenDropdownItemStyle}
                                >
                                    {/* Left part: Logo + Symbol */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {token.logoURI && <img src={token.logoURI} alt={token.symbol} style={tokenLogoStyle} />}
                                        <span style={tokenSymbolStyle}>{token.symbol}</span>
                                    </div>

                                    {/* Right part: Truncated Address + Copy Button */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={tokenAddressStyle}>
                                            {token.address ? truncateAddress(token.address) : ''}
                                        </span>
                                        <button
                                            // Prevent the parent div's onClick (token selection) from firing when this button is clicked
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopyAddress(token.address);
                                            }}
                                            style={copyButtonStyle}
                                        >
                                            {/* Conditional text for copy feedback */}
                                            {copiedAddress === token.address ? 'Copied!' : '📋'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Recipient Address Field */}
            <div style={fieldContainerStyle}>
                <label htmlFor="recipient-address" style={labelStyle}>Recipient Address:</label>
                <input
                    id="recipient-address"
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="0x..."
                    style={inputFieldStyle}
                />
            </div>

            {/* Password Field */}
            <div style={fieldContainerStyle}>
                <label htmlFor="password" style={labelStyle}>Password:</label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password [min 7 characters]"
                    style={inputFieldStyle}
                />
            </div>

            {/* Approval Section for ERC-20 Tokens */}
            {selectedToken && !selectedToken.isNative && isConnected && amount && parseFloat(amount) > 0 && (
                <div style={approvalSectionStyle}>
                    <p style={approvalTextStyle}>
                        Current Allowance to PST Contract: {formatUnits(allowance, selectedToken.decimals)} {selectedToken.symbol}
                    </p>
                    {!isAllowanceSufficient && (
                        <p style={{ ...approvalTextStyle, color: 'orange', fontWeight: 'bold' }}>
                            Approval needed: You need to approve at least {formattedTotalTransferCost} {selectedToken.symbol} for the PST Contract.
                        </p>
                    )}
                    <button
                        onClick={handleApprove}
                        disabled={isERC20WritePending || isConfirming || !isConnected || isAllowanceSufficient}
                        style={{
                            ...formButtonStyle,
                            marginTop: '10px',
                            background: isAllowanceSufficient ? '#4CAF50' : '#007bff',
                            boxShadow: isAllowanceSufficient ? 'none' : formButtonStyle.boxShadow,
                        }}
                    >
                        {isERC20WritePending ? 'Approving...' : isAllowanceSufficient ? 'Approved!' : 'Approve PST Contract'}
                    </button>
                </div>
            )}

            {/* Main Create Transfer Button */}
            <button
                onClick={handleTransfer}
                disabled={
                    isPending ||
                    isConfirming ||
                    !selectedToken ||
                    !isAddress(recipientAddress) ||
                    !amount ||
                    parseFloat(amount) <= 0 ||
                    !password ||
                    !isConnected ||
                    !chain ||
                    (!selectedToken.isNative && !isAllowanceSufficient) ||
                    (sFeeScalingFactor === 0n || sLimitLevelOne === 0n || sLimitLevelTwo === 0n ||
                        isLoadingTransferFees || transferFees.lvlOne < 0n || transferFees.lvlTwo < 0n || transferFees.lvlThree < 0n)
                }
                style={
                    isPending || isConfirming || !selectedToken || !isAddress(recipientAddress) || !amount || parseFloat(amount) <= 0 || !password || !isConnected || !chain || (!selectedToken.isNative && !isAllowanceSufficient) || (sFeeScalingFactor === 0n || sLimitLevelOne === 0n || sLimitLevelTwo === 0n || isLoadingTransferFees || transferFees.lvlOne < 0n || transferFees.lvlTwo < 0n || transferFees.lvlThree < 0n)
                        ? disabledButtonStyle
                        : formButtonStyle
                }
            >
                {isPending ? 'Confirming...' : isConfirming ? 'Transferring...' : 'Create Transfer'}
            </button>

            {/* Transaction Status and Errors */}
            {transactionHashToWatch ? (
                <p style={transactionStatusStyle}>Transaction Hash: <a href={getExplorerUrl(transactionHashToWatch)} target="_blank" rel="noopener noreferrer" style={linkStyle}>{transactionHashToWatch}</a></p>
            ) : null}
            {isConfirming && <p style={transactionStatusStyle}>Waiting for confirmation...</p>}
            {isConfirmed && <p style={{ ...transactionStatusStyle, color: '#4CAF50' }}>Transfer confirmed!</p>}
            {transactionError && <p style={{ ...transactionStatusStyle, color: 'red' }}>Error: {transactionError.message}</p>}
        </div>
    );
};

export default CreateTransfer;




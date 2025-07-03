// src/components/ClaimTransfers.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useConfig } from 'wagmi'; // Import useConfig
import { formatUnits, Address } from 'viem';
import type { Abi } from 'viem';
import { useQueries } from '@tanstack/react-query'; // Import useQueries
import { readContract } from '@wagmi/core'; // Import readContract from wagmi/core

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import pre-approved tokens list (needed for token decimals lookup)
import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList'; // Ensure this import is present

// Import React's CSSProperties type
import type { CSSProperties } from 'react';

// Import the new ClaimTransferButton component
import ClaimTransferButton from './ClaimTransferButton';

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

// --- STYLES FOR CLAIMABLE TRANSFERS SECTION ---
const claimTransfersContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '1200px', // Adjusted width for table to accommodate new columns
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const claimTransfersTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const tableContainerStyle: CSSProperties = {
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    overflowX: 'auto', // Added to ensure horizontal scrolling if content overflows
};

const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    backgroundColor: '#2c2c2c',
    borderRadius: '12px', // Ensure rounded corners for the table itself
};

const tableHeaderStyle: CSSProperties = {
    backgroundColor: '#3a3a3a',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '12px 15px',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
    zIndex: 1,
};

const tableRowStyle: CSSProperties = {
    borderBottom: '1px solid #3a3a3a',
};

const tableDataStyle: CSSProperties = {
    padding: '12px 15px',
    fontSize: '14px',
    color: '#eee',
    verticalAlign: 'middle',
};

const tokenDisplayContainerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const tokenAddressStyle: CSSProperties = {
    fontSize: '12px',
    color: '#888',
    fontFamily: 'monospace',
};

const copyButtonStyle: CSSProperties = {
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
};

const disconnectedNetworkStyle: CSSProperties = {
    fontSize: '14px',
    color: 'red',
    textAlign: 'center',
    marginBottom: '20px',
};

const passwordInputStyle: CSSProperties = {
    width: '100px', // Adjusted width for password input
    padding: '8px 12px',
    background: '#3a3a3a',
    border: '1px solid #555',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px', // Adjusted font size
    outline: 'none',
};

// Define a custom error interface to safely access 'cause'
interface CustomError extends Error {
    cause?: unknown;
    shortMessage?: string;
    details?: string;
    data?: { message?: string; data?: unknown; };
}

// --- UTILITY FUNCTIONS ---
const truncateAddress = (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

const copyToClipboard = async (text: string, setCopiedAddress: React.Dispatch<React.SetStateAction<string | null>>) => {
    try {
        await navigator.clipboard.writeText(text);
        setCopiedAddress(text);
        setTimeout(() => {
            setCopiedAddress(null);
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy address. Please try again.');
    }
};

const formatTimestamp = (timestamp: bigint | undefined): string => {
    if (timestamp === undefined || timestamp === 0n) return 'N/A';
    const date = new Date(Number(timestamp) * 1000); // Convert seconds to milliseconds
    return date.toLocaleString(); // Formats to local date and time string
};

// Define a type for the token objects expected in ALL_NETWORK_TOKENS
interface TokenInfo {
    address: Address;
    symbol: string;
    decimals: number;
    name: string;
    logoURI?: string;
    isNative?: boolean;
}

// --- CLAIM TRANSFER ROW COMPONENT ---
interface ClaimTransferRowProps {
    index: number;
    transferId: bigint;
    contractAddress: Address; // Renamed from pstContractAddress
    chainId: number;
    userAddress: Address | undefined; // The connected user's address for filtering
    onClaimActionCompleted: (claimedTransferId: bigint) => void; // Corrected signature here
    initialTransferDetails: [Address, Address, Address, bigint, bigint, bigint, string]; // Now mandatory to pass pre-fetched details
}

const ClaimTransferRow: React.FC<ClaimTransferRowProps> = ({
    index,
    transferId,
    contractAddress, // Renamed from pstContractAddress
    chainId,
    userAddress,
    onClaimActionCompleted,
    initialTransferDetails,
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [password, setPassword] = useState<string>(''); // State for password input - now defined here

    const [
        sender,
        receiver,
        tokenAddress,
        amount,
        creationTime,
        expiringTime,
        status,
    ] = initialTransferDetails;

    // --- Determine Token Decimals and Symbol ---
    let localTokenSymbol: string | undefined;
    let localTokenDecimals: number | undefined;
    let isLoadingTokenData = false;
    let tokenDataError: Error | undefined;

    const isERC20Token = tokenAddress !== '0x0000000000000000000000000000000000000000';

    // 1. Try to get from ALL_NETWORK_TOKENS first for ERC20s
    if (isERC20Token && chainId) {
        const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chainId);
        if (networkConfig && Array.isArray(networkConfig.tokens)) {
            const foundToken = (networkConfig.tokens as TokenInfo[]).find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
            if (foundToken) {
                localTokenSymbol = foundToken.symbol;
                localTokenDecimals = foundToken.decimals;
            }
        }
    } else if (!isERC20Token) { // It's native ETH
        localTokenSymbol = 'ETH';
        localTokenDecimals = 18;
    }

    // 2. If ERC20 and not found in ALL_NETWORK_TOKENS, use useReadContract as fallback
    // Only enable useReadContract if it's an ERC20 and we haven't found decimals/symbol yet
    const { data: fetchedSymbol, isLoading: isSymbolLoading, error: symbolError } = useReadContract({
        address: isERC20Token && localTokenSymbol === undefined ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'symbol',
        chainId: chainId,
        query: {
            enabled: isERC20Token && localTokenSymbol === undefined && !!tokenAddress, // Ensure tokenAddress is valid for query
            staleTime: Infinity,
        }
    }) as { data?: string, isLoading: boolean, error?: Error };

    const { data: fetchedDecimals, isLoading: isDecimalsLoading, error: decimalsError } = useReadContract({
        address: isERC20Token && localTokenDecimals === undefined ? tokenAddress : undefined, // Check localTokenDecimals for fallback
        abi: ERC20_CONTRACT_ABI,
        functionName: 'decimals',
        chainId: chainId,
        query: {
            enabled: isERC20Token && localTokenDecimals === undefined && !!tokenAddress, // Enable only if isERC20Token and chainId are valid
            staleTime: Infinity,
        }
    }) as { data?: number, isLoading: boolean, error?: Error };

    // Update local variables if fetched data is available
    if (fetchedSymbol !== undefined) localTokenSymbol = fetchedSymbol;
    if (fetchedDecimals !== undefined) localTokenDecimals = fetchedDecimals;

    isLoadingTokenData = isSymbolLoading || isDecimalsLoading;
    tokenDataError = symbolError || decimalsError;

    const displayAmount = (amount && localTokenDecimals !== undefined) ? formatUnits(amount, localTokenDecimals) : (isLoadingTokenData ? 'Loading...' : 'N/A');

    // Only render row if current user is the receiver and transfer is pending
    const isClaimableByCurrentUser = userAddress?.toLowerCase() === receiver.toLowerCase() && status === "Pending";

    if (!isClaimableByCurrentUser) {
        return null; // Don't render if not claimable by current user or not pending
    }

    if (isLoadingTokenData) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={10}>Loading token details...</td> {/* Adjusted colspan */}
            </tr>
        );
    }

    if (tokenDataError) {
        console.error("Error fetching token details for", tokenAddress, tokenDataError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={10}>Error fetching token data.</td> {/* Adjusted colspan */}
            </tr>
        );
    }

    return (
        <tr style={tableRowStyle}>
            <td style={tableDataStyle}>{index + 1}</td>
            <td style={tableDataStyle}>{truncateAddress(sender)}</td>
            <td style={tableDataStyle}>{truncateAddress(receiver)}</td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{localTokenSymbol || 'ETH'}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress, setCopiedAddress);
                        }}
                        style={copyButtonStyle}
                    >
                        {copiedAddress === tokenAddress ? 'Copied!' : '📋'}
                    </button>
                </div>
            </td>
            <td style={tableDataStyle}>{displayAmount}</td>
            <td style={tableDataStyle}>{formatTimestamp(creationTime)}</td>
            <td style={tableDataStyle}>{formatTimestamp(expiringTime)}</td>
            <td style={tableDataStyle}>{status}</td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{transferId.toString()}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(transferId.toString(), setCopiedAddress);
                        }}
                        style={copyButtonStyle}
                    >
                        {copiedAddress === transferId.toString() ? 'Copied!' : '?'}
                    </button>
                </div>
            </td>
            {/* New column for Password Input */}
            <td style={tableDataStyle}>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    style={passwordInputStyle}
                />
            </td>
            {/* ClaimTransfer Button */}
            <td style={tableDataStyle}>
                {userAddress && contractAddress && chainId ? (
                    <ClaimTransferButton
                        transferId={transferId}
                        pstContractAddress={contractAddress}
                        chainId={chainId}
                        password={password}
                        receiverAddress={receiver}
                        transferStatus={status}
                        onClaimActionCompleted={onClaimActionCompleted} // Pass the updated callback
                    />
                ) : (
                    <span style={{ color: '#888', fontSize: '12px' }}>Connect wallet for actions</span>
                )}
            </td>
        </tr>
    );
};


// --- CLAIMABLE TRANSFERS MAIN COMPONENT ---
interface ClaimTransfersProps {
    // No specific props needed for now, it manages its own state
}

// Define a type for a claimable transfer item, including its details
interface ClaimableTransferItem {
    transferId: bigint;
    details: [Address, Address, Address, bigint, bigint, bigint, string];
}

const ClaimTransfers: React.FC<ClaimTransfersProps> = () => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const config = useConfig(); // Get the wagmi config object

    const pstContractAddressForChain = getPSTContractAddress(chain?.id);

    // State to trigger refetch of the list of transfer IDs
    const [refetchTrigger, setRefetchTrigger] = useState<boolean>(false);
    // State to hold the currently displayed claimable transfers (for optimistic updates)
    const [displayedClaimableTransfers, setDisplayedClaimableTransfers] = useState<ClaimableTransferItem[]>([]);

    // New flag to track if initial data load is complete
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);


    // Determine if contract details and chain ID are ready for any read operations
    const areContractDetailsReady = !!pstContractAddressForChain && !!chain?.id;

    // 1. Fetch ALL pending transfer IDs associated with the connected user's address
    const { data: allPendingTransferIds = [], isLoading: isLoadingAllPendingIds, error: allPendingIdsError, refetch: refetchAllPendingIds } = useReadContract({
        address: areContractDetailsReady ? pstContractAddressForChain : undefined,
        abi: PST_CONTRACT_ABI,
        functionName: 'getPendingTransfersForAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: areContractDetailsReady ? chain.id : undefined, // Safely access chain.id
        query: {
            enabled: !!userAddress && isConnected && areContractDetailsReady,
            staleTime: 5000, // Refresh every 5 seconds
        }
    }) as { data?: bigint[], isLoading: boolean, error: Error | null, refetch: () => void };

    // 2. Fetch details for each transfer ID fetched in step 1 using useQueries
    const transferDetailsQueries = useQueries({
        queries: allPendingTransferIds.map((transferId) => ({
            queryKey: ['claimTransferDetails', transferId.toString(), chain?.id, pstContractAddressForChain], // Unique query key
            queryFn: async () => {
                if (!pstContractAddressForChain || transferId === undefined || !chain?.id) {
                    throw new Error("Missing contract address, transfer ID, or chain ID for getTransferDetails.");
                }
                // Use readContract from @wagmi/core directly, passing config as the first argument
                const result = await readContract(config, { // Pass config here
                    address: pstContractAddressForChain,
                    abi: PST_CONTRACT_ABI,
                    functionName: 'getTransferDetails',
                    args: [transferId],
                    chainId: chain?.id,
                });
                return result;
            },
            enabled: areContractDetailsReady, // Enable individual queries if contract details are ready
            staleTime: 10000,
        })),
    });

    // 3. Filter transfers to only include those claimable by the current user
    const claimableTransfers = allPendingTransferIds
        .map((transferId, index) => {
            const queryResult = transferDetailsQueries[index];
            if (!queryResult) {
                return null;
            }
            const details = queryResult.data as [Address, Address, Address, bigint, bigint, bigint, string] | undefined;

            if (queryResult.isLoading || queryResult.error || !details) {
                return null;
            }

            const [, receiver, , , , , status] = details;
            if (userAddress?.toLowerCase() === receiver.toLowerCase() && status === "Pending") {
                return { transferId, details };
            }
            return null;
        })
        .filter(Boolean) as ClaimableTransferItem[]; // Type assert to the new interface

    // Sort the claimable transfers by transferId
    claimableTransfers.sort((a, b) => {
        if (a.transferId < b.transferId) return -1;
        if (a.transferId > b.transferId) return 1;
        return 0;
    });

    // Effect to update displayedClaimableTransfers ONLY on initial load or full data refresh
    useEffect(() => {
        const anyDetailsLoading = transferDetailsQueries.some(query => query?.isLoading);
        const anyDetailsError = transferDetailsQueries.some(query => query?.error);

        if (!initialLoadComplete && !isLoadingAllPendingIds && !anyDetailsLoading && !allPendingIdsError && !anyDetailsError) {
            setDisplayedClaimableTransfers(claimableTransfers);
            setInitialLoadComplete(true); // Mark initial load as complete
        }
    }, [claimableTransfers, isLoadingAllPendingIds, allPendingIdsError, transferDetailsQueries, initialLoadComplete]);


    // Determine overall loading and error states for the display messages
    const isLoadingAnyDetails = transferDetailsQueries.some(query => query?.isLoading);
    const hasAnyErrorInDetails = transferDetailsQueries.some(query => query?.error);

    let displayErrorMessage: string | null = null;
    if (allPendingIdsError) {
        displayErrorMessage = allPendingIdsError.message;
    } else if (hasAnyErrorInDetails) {
        const firstDetailError = transferDetailsQueries.find(query => query?.error)?.error;
        displayErrorMessage = (firstDetailError instanceof Error) ? firstDetailError.message : "One or more transfer details failed to load.";
    }

    // Callback to trigger a refetch of the pending transfers, now accepting the claimed ID
    const handleClaimActionCompleted = useCallback((claimedTransferId: bigint) => {
        // Optimistically remove the claimed transfer from the displayed list
        setDisplayedClaimableTransfers(prev =>
            prev.filter(item => item.transferId !== claimedTransferId)
        );
        // Trigger a full refetch to reconcile after a short delay to allow UI to update
        setTimeout(() => {
            setRefetchTrigger(prev => !prev);
        }, 100); // Small delay
    }, []);

    // Effect to trigger refetch when refetchTrigger changes
    useEffect(() => {
        if (refetchTrigger) {
            refetchAllPendingIds();
            setRefetchTrigger(false);
        }
    }, [refetchTrigger, refetchAllPendingIds]);


    return (
        <div style={claimTransfersContainerStyle}>
            <h2 style={claimTransfersTitleStyle}>Transfers Waiting For You To Claim</h2>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see transfers waiting to be claimed.</p>
            ) : isLoadingAllPendingIds || isLoadingAnyDetails ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading claimable transfers...</p>
            ) : displayErrorMessage ? (
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading transfers: {displayErrorMessage}</p>
            ) : displayedClaimableTransfers.length === 0 ? ( // Use displayedClaimableTransfers here
                <p style={{ textAlign: 'center', color: '#ccc' }}>No transfers to claim.</p>
            ) : (
                <div style={tableContainerStyle}>
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={tableHeaderStyle}>Index</th>
                                <th style={tableHeaderStyle}>Sender</th>
                                <th style={tableHeaderStyle}>Receiver</th>
                                <th style={tableHeaderStyle}>Token</th>
                                <th style={tableHeaderStyle}>Amount</th>
                                <th style={tableHeaderStyle}>Creation Time</th>
                                <th style={tableHeaderStyle}>Expiration Time</th>
                                <th style={tableHeaderStyle}>Status</th>
                                <th style={tableHeaderStyle}>Transfer ID</th>
                                <th style={tableHeaderStyle}>Password</th> {/* New Header */}
                                <th style={tableHeaderStyle}>Action</th> {/* Header for Claim Button */}
                            </tr>
                        </thead>
                        <tbody>
                            {displayedClaimableTransfers.map((item, index) => ( // Use displayedClaimableTransfers here
                                <ClaimTransferRow
                                    key={item.transferId.toString()}
                                    index={index}
                                    transferId={item.transferId}
                                    contractAddress={pstContractAddressForChain as Address}
                                    chainId={chain?.id as number}
                                    userAddress={userAddress}
                                    onClaimActionCompleted={handleClaimActionCompleted}
                                    initialTransferDetails={item.details}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ClaimTransfers;

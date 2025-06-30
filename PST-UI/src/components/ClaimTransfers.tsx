// src/components/ClaimTransfers.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, Address } from 'viem';
import type { Abi } from 'viem';

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import pre-approved tokens list (needed for token decimals lookup)
import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList';

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
const claimableTransfersContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '1250px', // Adjusted width for better spacing
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const claimableTransfersTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const tableContainerStyle: CSSProperties = {
    // No maxHeight or overflowY to allow table to expand vertically,
    // relying on the main container scroll.
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
};

const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    backgroundColor: '#2c2c2c',
    borderRadius: '12px',
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

// --- CLAIMABLE TRANSFER ROW COMPONENT ---
interface ClaimTransferRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address;
    chainId: number;
    userAddress: Address | undefined; // The connected user's address for filtering
    onClaimActionCompleted: () => void; // Callback for when a claim action is completed
    initialTransferDetails: [Address, Address, Address, bigint, bigint, bigint, string]; // Now mandatory to pass pre-fetched details
}

const ClaimTransferRow: React.FC<ClaimTransferRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
    userAddress,
    onClaimActionCompleted,
    initialTransferDetails, // Directly use initial details
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [password, setPassword] = useState<string>(''); // State for password input - now defined here

    // We no longer call useReadContract for details here, relying on initialTransferDetails
    const [
        sender,
        receiver,
        tokenAddress,
        amount,
        creationTime,
        expiringTime,
        status,
    ] = initialTransferDetails; // Destructure directly from prop

    // Fetch token symbol and decimals if it's an ERC20 token
    const isERC20Token = tokenAddress !== '0x0000000000000000000000000000000000000000'; // Assuming 0x0 is native ETH
    const { data: tokenSymbol, isLoading: isTokenSymbolLoading, error: tokenSymbolError } = useReadContract({
        address: isERC20Token ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'symbol',
        chainId: chainId,
        query: {
            enabled: isERC20Token,
            staleTime: Infinity, // Token symbols usually don't change
        }
    }) as { data?: string, isLoading: boolean, error?: Error };

    const { data: tokenDecimals, isLoading: isTokenDecimalsLoading, error: tokenDecimalsError } = useReadContract({
        address: isERC20Token ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'decimals',
        chainId: chainId,
        query: {
            enabled: isERC20Token,
            staleTime: Infinity,
        }
    }) as { data?: number, isLoading: boolean, error?: Error };

    const displayAmount = (amount && tokenDecimals !== undefined) ? formatUnits(amount, tokenDecimals) : (isERC20Token ? '...' : formatUnits(amount, 18)); // Default to 18 for native if decimals not fetched

    // Only render row if current user is the receiver and transfer is pending
    const isClaimableByCurrentUser = userAddress?.toLowerCase() === receiver.toLowerCase() && status === "Pending";

    if (!isClaimableByCurrentUser) {
        return null; // Don't render if not claimable by current user or not pending
    }

    if (isTokenSymbolLoading || isTokenDecimalsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={10}>Loading token details...</td> {/* Adjusted colspan */}
            </tr>
        );
    }

    if (tokenSymbolError || tokenDecimalsError) {
        console.error("Error fetching token details for", tokenAddress, tokenSymbolError || tokenDecimalsError);
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
                    <span>{tokenSymbol || 'ETH'}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress, setCopiedAddress);
                        }}
                        style={copyButtonStyle}
                    >
                        {copiedAddress === tokenAddress ? 'Copied!' : '�'}
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
                        {copiedAddress === transferId.toString() ? 'Copied!' : '📋'}
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
                <ClaimTransferButton
                    transferId={transferId}
                    pstContractAddress={pstContractAddress}
                    chainId={chainId}
                    password={password}
                    receiverAddress={receiver}
                    transferStatus={status}
                    onClaimSuccess={onClaimActionCompleted}
                />
            </td>
        </tr>
    );
};


// --- CLAIMABLE TRANSFERS MAIN COMPONENT ---
interface ClaimTransfersProps {
    // No specific props needed for now, it manages its own state
}

const ClaimTransfers: React.FC<ClaimTransfersProps> = () => {
    const { address: userAddress, chain, isConnected } = useAccount();

    const pstContractAddress = getPSTContractAddress(chain?.id);

    // State to trigger refetch of the list of transfer IDs
    const [refetchTrigger, setRefetchTrigger] = useState<boolean>(false);

    // 1. Fetch ALL pending transfer IDs associated with the connected user's address
    const { data: allPendingTransferIds = [], isLoading: isLoadingAllPendingIds, error: allPendingIdsError, refetch: refetchAllPendingIds } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getPendingTransfersForAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!pstContractAddress && isConnected,
            staleTime: 5000, // Refresh every 5 seconds
        }
    }) as { data?: bigint[], isLoading: boolean, error: Error | null, refetch: () => void };

    // 2. Fetch details for each transfer ID fetched in step 1
    // This creates an array of objects from useReadContract, each with { data, isLoading, error }
    const transferDetailsQueries = allPendingTransferIds.map((transferId) =>
        useReadContract({
            address: pstContractAddress,
            abi: PST_CONTRACT_ABI,
            functionName: 'getTransferDetails',
            args: [transferId],
            chainId: chain?.id,
            query: {
                enabled: !!pstContractAddress && transferId !== undefined,
                staleTime: 10000,
            },
        })
    );

    // 3. Filter transfers to only include those claimable by the current user AND
    //    are not currently loading their details and have no detail errors.
    const claimableTransfers = allPendingTransferIds
        .map((transferId, index) => {
            const queryResult = transferDetailsQueries[index];
            const details = queryResult.data as [Address, Address, Address, bigint, bigint, bigint, string] | undefined;

            if (queryResult.isLoading || queryResult.error || !details) {
                return null; // Exclude if still loading, has an error, or details are not available
            }

            const [, receiver, , , , , status] = details; // Destructure to check receiver and status
            if (userAddress?.toLowerCase() === receiver.toLowerCase() && status === "Pending") {
                return { transferId, details }; // Return object with ID and full details
            }
            return null;
        })
        .filter(Boolean) as { transferId: bigint; details: [Address, Address, Address, bigint, bigint, bigint, string] }[]; // Filter out nulls and type assert

    // Sort the claimable transfers by transferId
    claimableTransfers.sort((a, b) => {
        // Compare BigInts directly
        if (a.transferId < b.transferId) return -1;
        if (a.transferId > b.transferId) return 1;
        return 0;
    });

    // Determine overall loading and error states for the display messages
    const isLoadingAnyDetails = transferDetailsQueries.some(query => query.isLoading);
    const hasAnyErrorInDetails = transferDetailsQueries.some(query => query.error);

    // Consolidated error message for display
    let displayErrorMessage: string | null = null;
    if (allPendingIdsError) {
        displayErrorMessage = allPendingIdsError.message;
    } else if (hasAnyErrorInDetails) {
        // Find the first error message from individual detail fetches, or provide a generic one
        const firstDetailError = transferDetailsQueries.find(query => query.error)?.error;
        displayErrorMessage = firstDetailError?.message || "One or more transfer details failed to load.";
    }


    // Callback to trigger a refetch of the pending transfers
    const handleClaimActionCompleted = useCallback(() => {
        setRefetchTrigger(prev => !prev); // Toggle to trigger useEffect and refetch
    }, []);

    // Effect to trigger refetch when refetchTrigger changes
    useEffect(() => {
        if (refetchTrigger) {
            refetchAllPendingIds();
            // Note: Individual transferDetailsQueries will also refetch due to their staleTime and 'enabled' condition
            setRefetchTrigger(false); // Reset trigger
        }
    }, [refetchTrigger, refetchAllPendingIds]);


    return (
        <div style={claimableTransfersContainerStyle}>
            <h2 style={claimableTransfersTitleStyle}>Transfers Waiting For You To Claim</h2>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see transfers waiting to be claimed.</p>
            ) : isLoadingAllPendingIds || isLoadingAnyDetails ? ( // Check for all loading states
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading claimable transfers...</p>
            ) : displayErrorMessage ? ( // Show consolidated error message
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading transfers: {displayErrorMessage}</p>
            ) : claimableTransfers.length === 0 ? ( // Show "No transfers" message if filtered list is empty
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
                            {claimableTransfers.map((item, index) => (
                                <ClaimTransferRow
                                    key={item.transferId.toString()}
                                    index={index}
                                    transferId={item.transferId}
                                    pstContractAddress={pstContractAddress as Address}
                                    chainId={chain?.id as number}
                                    userAddress={userAddress}
                                    onClaimActionCompleted={handleClaimActionCompleted}
                                    initialTransferDetails={item.details} // Pass pre-fetched details
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

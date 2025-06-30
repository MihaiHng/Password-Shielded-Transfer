// src/components/History.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, Address } from 'viem';
import type { Abi } from 'viem';

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import React's CSSProperties type
import type { CSSProperties } from 'react';

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

// --- STYLES FOR HISTORY SECTION ---
const historyContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '1100px', // Adjusted width for history table (no password/action column)
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const historyTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const tableContainerStyle: CSSProperties = {
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

// --- HISTORY TABLE ROW COMPONENT ---
interface HistoryRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address;
    chainId: number;
    initialTransferDetails: [Address, Address, Address, bigint, bigint, bigint, string]; // Pre-fetched details
}

const HistoryRow: React.FC<HistoryRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
    initialTransferDetails,
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    const [
        sender,
        receiver,
        tokenAddress,
        amount,
        creationTime,
        expiringTime,
        status,
    ] = initialTransferDetails;

    // Fetch token symbol and decimals if it's an ERC20 token
    const isERC20Token = tokenAddress !== '0x0000000000000000000000000000000000000000'; // Assuming 0x0 is native ETH
    const { data: tokenSymbol, isLoading: isTokenSymbolLoading, error: tokenSymbolError } = useReadContract({
        address: isERC20Token ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'symbol',
        chainId: chainId,
        query: {
            enabled: isERC20Token,
            staleTime: Infinity,
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

    if (isTokenSymbolLoading || isTokenDecimalsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={8}>Loading token details...</td>
            </tr>
        );
    }

    if (tokenSymbolError || tokenDecimalsError) {
        console.error("Error fetching token details for", tokenAddress, tokenSymbolError || tokenDecimalsError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={8}>Error fetching token data.</td>
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
                        {copiedAddress === transferId.toString() ? 'Copied!' : '📋'}
                    </button>
                </div>
            </td>
            {/* No Action or Password column in History */}
        </tr>
    );
};

// --- HISTORY MAIN COMPONENT ---
const History: React.FC = () => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const pstContractAddress = getPSTContractAddress(chain?.id);

    // Fetch IDs for Canceled transfers
    const { data: canceledIds = [], isLoading: isLoadingCanceled, error: canceledError } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getCanceledTransfersForAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: chain?.id,
        query: { enabled: !!userAddress && !!pstContractAddress && isConnected, staleTime: 10000 },
    }) as { data?: bigint[], isLoading: boolean, error: Error | null };

    // Fetch IDs for Expired and Refunded transfers
    const { data: expiredIds = [], isLoading: isLoadingExpired, error: expiredError } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getExpiredAndRefundedTransfersForAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: chain?.id,
        query: { enabled: !!userAddress && !!pstContractAddress && isConnected, staleTime: 10000 },
    }) as { data?: bigint[], isLoading: boolean, error: Error | null };

    // Fetch IDs for Claimed transfers
    const { data: claimedIds = [], isLoading: isLoadingClaimed, error: claimedError } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getClaimedTransfersForAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: chain?.id,
        query: { enabled: !!userAddress && !!pstContractAddress && isConnected, staleTime: 10000 },
    }) as { data?: bigint[], isLoading: boolean, error: Error | null };

    // Combine all unique transfer IDs
    const allProcessedTransferIds = Array.from(new Set([
        ...canceledIds,
        ...expiredIds,
        ...claimedIds,
    ]));

    // Fetch details for each of the combined transfer IDs
    const transferDetailsQueries = allProcessedTransferIds.map((transferId) =>
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

    // Filter and prepare the final list of historical transfers
    const historicalTransfers = allProcessedTransferIds
        .map((transferId, index) => {
            const queryResult = transferDetailsQueries[index];
            const details = queryResult.data as [Address, Address, Address, bigint, bigint, bigint, string] | undefined;

            if (queryResult.isLoading || queryResult.error || !details) {
                return null; // Exclude if still loading, has an error, or details are not available
            }

            const [sender, receiver, , , , , status] = details;
            // A transfer is considered "historical" if it's Canceled, Expired, or Claimed
            // AND the current user was either the sender or the receiver
            const isUserInvolved = userAddress?.toLowerCase() === sender.toLowerCase() || userAddress?.toLowerCase() === receiver.toLowerCase();
            const isProcessedStatus = status === "Canceled" || status === "ExpiredAndRefunded" || status === "Claimed";

            if (isUserInvolved && isProcessedStatus) {
                return { transferId, details };
            }
            return null;
        })
        .filter(Boolean) as { transferId: bigint; details: [Address, Address, Address, bigint, bigint, bigint, string] }[];

    // Sort the historical transfers by transferId
    historicalTransfers.sort((a, b) => {
        if (a.transferId < b.transferId) return -1;
        if (a.transferId > b.transferId) return 1;
        return 0;
    });

    // Determine overall loading and error states for display messages
    const isLoadingAny = isLoadingCanceled || isLoadingExpired || isLoadingClaimed || transferDetailsQueries.some(q => q.isLoading);
    const hasAnyError = canceledError || expiredError || claimedError || transferDetailsQueries.some(q => q.error);

    let displayErrorMessage: string | null = null;
    if (canceledError || expiredError || claimedError) {
        displayErrorMessage = (canceledError || expiredError || claimedError)?.message || "Error loading transfer history.";
    } else if (hasAnyError) {
        const firstDetailError = transferDetailsQueries.find(query => query.error)?.error;
        displayErrorMessage = (firstDetailError instanceof Error) ? firstDetailError.message : "One or more transfer details failed to load.";
    }

    return (
        <div style={historyContainerStyle}>
            <h2 style={historyTitleStyle}>Your Transfer History</h2>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see your transfer history.</p>
            ) : isLoadingAny ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading transfer history...</p>
            ) : displayErrorMessage ? (
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading history: {displayErrorMessage}</p>
            ) : historicalTransfers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>No processed transfers found for your address.</p>
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
                            </tr>
                        </thead>
                        <tbody>
                            {historicalTransfers.map((item, index) => (
                                <HistoryRow
                                    key={item.transferId.toString()}
                                    index={index}
                                    transferId={item.transferId}
                                    pstContractAddress={pstContractAddress as Address}
                                    chainId={chain?.id as number}
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

export default History;

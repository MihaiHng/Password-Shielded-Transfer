// src/components/PendingTransfers.tsx

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

// Type assertions for ABIs
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

// --- STYLES FOR PENDING TRANSFERS SECTION ---
const pendingTransfersContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '950px', // Wider for table to accommodate new columns
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const pendingTransfersTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const tableContainerStyle: CSSProperties = {
    maxHeight: '300px', // Fixed height for scrollability
    overflowY: 'auto',
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

// --- PENDING TRANSFER ROW COMPONENT (NESTED WITHIN PendingTransfers) ---
interface PendingTransferRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address;
    chainId: number;
}

const PendingTransferRow: React.FC<PendingTransferRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    // Fetch transfer details
    const { data: transferDetails, isLoading: isDetailsLoading, error: detailsError } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getTransferDetails',
        args: [transferId],
        chainId: chainId,
        query: {
            enabled: !!pstContractAddress && transferId !== undefined,
            staleTime: 10000, // Refetch every 10 seconds
        },
    }) as { data?: [Address, Address, Address, bigint, bigint, bigint, string], isLoading: boolean, error: Error | null };

    // Safely destructure transfer details
    const [
        sender,
        receiver,
        tokenAddress,
        amount,
        creationTime,
        expiringTime,
        status,
    ] = transferDetails || [
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        0n, 0n, 0n, 'Loading...'
    ];

    // Fetch token symbol and decimals if it's an ERC20 token
    const isERC20Token = tokenAddress !== '0x0000000000000000000000000000000000000000'; // Assuming 0x0 is native
    const { data: tokenSymbol, isLoading: isTokenSymbolLoading } = useReadContract({
        address: isERC20Token ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'symbol',
        chainId: chainId,
        query: {
            enabled: isERC20Token,
            staleTime: Infinity, // Token symbols usually don't change
        }
    }) as { data?: string, isLoading: boolean };

    const { data: tokenDecimals, isLoading: isTokenDecimalsLoading } = useReadContract({
        address: isERC20Token ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'decimals',
        chainId: chainId,
        query: {
            enabled: isERC20Token,
            staleTime: Infinity,
        }
    }) as { data?: number, isLoading: boolean };

    const displayAmount = (amount && tokenDecimals !== undefined) ? formatUnits(amount, tokenDecimals) : (isERC20Token ? '...' : formatUnits(amount, 18)); // Default to 18 for native if decimals not fetched

    if (isDetailsLoading || isTokenSymbolLoading || isTokenDecimalsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={8}>Loading transfer details...</td> {/* Adjusted colspan for new columns */}
            </tr>
        );
    }

    if (detailsError) {
        console.error("Error fetching transfer details for ID", transferId.toString(), detailsError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={8}>Error: {detailsError.message}</td> {/* MERGED STYLE */}
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
                    <span>{tokenSymbol || 'ETH'}</span> {/* Display ETH for native, or fetched symbol */}
                    <span style={tokenAddressStyle}>
                        ({truncateAddress(tokenAddress)})
                    </span>
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
            <td style={tableDataStyle}>{formatTimestamp(creationTime)}</td> {/* New column */}
            <td style={tableDataStyle}>{formatTimestamp(expiringTime)}</td> {/* New column */}
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
        </tr>
    );
};

// --- PENDING TRANSFERS MAIN COMPONENT ---
interface PendingTransfersProps {
    pstContractAddress: Address | undefined;
    refetchTrigger: boolean; // Prop to trigger refetch from parent
}

const PendingTransfers: React.FC<PendingTransfersProps> = ({ pstContractAddress, refetchTrigger }) => {
    const { address: userAddress, chain, isConnected } = useAccount();

    // Fetch Pending Transfer IDs for the connected wallet
    const { data: pendingTransferIds = [], isLoading: isLoadingPendingIds, error: pendingIdsError, refetch: refetchPendingIds } = useReadContract({
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

    // Automatically refetch pending transfers when refetchTrigger changes
    useEffect(() => {
        if (refetchTrigger) {
            refetchPendingIds();
        }
    }, [refetchTrigger, refetchPendingIds]);


    return (
        <div style={pendingTransfersContainerStyle}>
            <h2 style={pendingTransfersTitleStyle}>Your Pending Transfers</h2>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see pending transfers.</p>
            ) : isLoadingPendingIds ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading pending transfers...</p>
            ) : pendingIdsError ? (
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading transfers: {pendingIdsError.message}</p>
            ) : pendingTransferIds.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>No pending transfers found for your address.</p>
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
                                <th style={tableHeaderStyle}>Creation Time</th> {/* New Header */}
                                <th style={tableHeaderStyle}>Expiration Time</th> {/* New Header */}
                                <th style={tableHeaderStyle}>Status</th>
                                <th style={tableHeaderStyle}>Transfer ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingTransferIds.map((transferId, index) => (
                                <PendingTransferRow
                                    key={transferId.toString()} // Use transferId as key
                                    index={index}
                                    transferId={transferId}
                                    pstContractAddress={pstContractAddress as Address} // Cast as Address since enabled check ensures it's not undefined
                                    chainId={chain?.id as number} // Cast as number since enabled check ensures it's not undefined
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PendingTransfers;

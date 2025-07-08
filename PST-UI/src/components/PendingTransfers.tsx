// src/components/PendingTransfers.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import pre-approved tokens list (needed for token decimals lookup)
import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList';

// Import the new CancelTransferButton component
import CancelTransferButton from './CancelTransferButton';

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

// --- STYLES FOR PENDING TRANSFERS SECTION ---
const pendingTransfersContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '1000px', // Wider for table to accommodate new columns
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

// --- PENDING TRANSFER ROW COMPONENT ---
// This component will now fetch its own details
interface PendingTransferRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address | undefined; // Make it optional
    chainId: number | undefined; // Make it optional
    userAddress: Address | undefined;
    onCancelSuccess: () => void;
}

const PendingTransferRow: React.FC<PendingTransferRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
    userAddress,
    onCancelSuccess,
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    // Determine if contract details and chain ID are ready for any read operations in this row
    const areRowContractDetailsReady = !!pstContractAddress && !!chainId;

    // Fetch transfer details within the row component
    const { data: transferDetails, isLoading: isDetailsLoading, error: detailsError } = useReadContract({
        address: areRowContractDetailsReady ? pstContractAddress : undefined,
        abi: PST_CONTRACT_ABI,
        functionName: 'getTransferDetails',
        args: [transferId],
        chainId: areRowContractDetailsReady ? chainId : undefined,
        query: {
            enabled: areRowContractDetailsReady && transferId !== undefined, // Ensure all params are valid
            staleTime: 10000,
        },
    }) as { data?: [Address, Address, Address, bigint, bigint, bigint, string], isLoading: boolean, error?: Error };

    // Derive values from transferDetails, providing fallbacks for initial loading state
    const sender = transferDetails?.[0];
    const receiver = transferDetails?.[1];
    const tokenAddress = transferDetails?.[2];
    const amount = transferDetails?.[3];
    const creationTime = transferDetails?.[4];
    const expiringTime = transferDetails?.[5];
    const status = transferDetails?.[6];

    // Determine if it's an ERC20 token (not native ETH)
    const isERC20Token = tokenAddress !== '0x0000000000000000000000000000000000000000' && !!tokenAddress;

    // Fetch token symbol and decimals if it's an ERC20 token and row details are ready
    const { data: tokenSymbol, isLoading: isTokenSymbolLoading, error: tokenSymbolError } = useReadContract({
        address: isERC20Token && areRowContractDetailsReady ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'symbol',
        chainId: areRowContractDetailsReady ? chainId : undefined,
        query: {
            enabled: isERC20Token && areRowContractDetailsReady,
            staleTime: Infinity,
        }
    }) as { data?: string, isLoading: boolean, error?: Error };

    const { data: tokenDecimals, isLoading: isTokenDecimalsLoading, error: tokenDecimalsError } = useReadContract({
        address: isERC20Token && areRowContractDetailsReady ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'decimals',
        chainId: areRowContractDetailsReady ? chainId : undefined,
        query: {
            enabled: isERC20Token && areRowContractDetailsReady,
            staleTime: Infinity,
        }
    }) as { data?: number, isLoading: boolean, error?: Error };

    // Now, handle loading/error states for the row's primary data (transferDetails)
    if (isDetailsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={9}>Loading transfer details...</td>
            </tr>
        );
    }

    if (detailsError || !transferDetails) {
        console.error("Error fetching transfer details for ID", transferId, detailsError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={9}>Error loading transfer details.</td>
            </tr>
        );
    }

    // Filter criteria: user is the SENDER AND the transfer status is "Pending"
    const isPendingAndSender = userAddress?.toLowerCase() === sender?.toLowerCase() && status === "Pending";

    // IMPORTANT: Only render the full row content (and call subsequent hooks) if it meets the criteria
    // This moves the conditional return AFTER all hooks have been called.
    if (!isPendingAndSender) {
        return null; // Don't render this row if it's not a pending transfer by the current sender
    }

    // Now, handle loading/error states for token details, only if the row is actually going to render.
    if (isTokenSymbolLoading || isTokenDecimalsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={9}>Loading token details...</td>
            </tr>
        );
    }

    if (tokenSymbolError || tokenDecimalsError) {
        console.error("Error fetching token details for", tokenAddress, tokenSymbolError || tokenDecimalsError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={9}>Error fetching token data.</td>
            </tr>
        );
    }

    const displayAmount = (amount && tokenDecimals !== undefined) ? formatUnits(amount, tokenDecimals) : (isERC20Token ? '...' : formatUnits(amount || 0n, 18)); // Ensure amount is BigInt for formatUnits

    return (
        <tr style={tableRowStyle}>
            <td style={tableDataStyle}>{index + 1}</td>
            <td style={tableDataStyle}>{truncateAddress(sender || 'N/A')}</td>
            <td style={tableDataStyle}>{truncateAddress(receiver || 'N/A')}</td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{tokenSymbol || 'ETH'}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress || '', setCopiedAddress);
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
            <td style={tableDataStyle}>
                {userAddress && pstContractAddress && chainId ? (
                    <CancelTransferButton
                        transferId={transferId}
                        pstContractAddress={pstContractAddress}
                        senderAddress={sender || '0x0'} // Provide fallback for senderAddress
                        transferStatus={status || 'Unknown'} // Provide fallback for status
                        chainId={chainId}
                        onCancelSuccess={onCancelSuccess}
                    />
                ) : (
                    <span style={{ color: '#888', fontSize: '12px' }}>Connect wallet for actions</span>
                )}
            </td>
        </tr>
    );
};

// --- PENDING TRANSFERS MAIN COMPONENT ---
interface PendingTransfersProps {
    pstContractAddress: Address | undefined;
    refetchTrigger: boolean;
    onTransferActionCompleted: () => void;
}

const PendingTransfers: React.FC<PendingTransfersProps> = ({ pstContractAddress, refetchTrigger, onTransferActionCompleted }) => {
    const { address: userAddress, chain, isConnected } = useAccount();

    const pstContractAddressForChain = getPSTContractAddress(chain?.id);

    const [localRefetchTrigger, setLocalRefetchTrigger] = useState<boolean>(false);

    // Determine if contract details and chain ID are ready for any read operations
    const areContractDetailsReady = !!pstContractAddressForChain && !!chain?.id;

    // 1. Fetch ALL transfer IDs associated with the connected user's address
    const { data: allRelatedTransferIds = [], isLoading: isLoadingAllIds, error: allIdsError, refetch: refetchAllIds } = useReadContract({
        address: areContractDetailsReady ? pstContractAddressForChain : undefined,
        abi: PST_CONTRACT_ABI,
        functionName: 'getPendingTransfersForAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: areContractDetailsReady ? chain.id : undefined, // Safely access chain.id
        query: {
            enabled: !!userAddress && isConnected && areContractDetailsReady,
            staleTime: 5000,
        }
    }) as { data?: bigint[], isLoading: boolean, error: Error | null, refetch: () => void };


    // Callback to trigger a refetch of the pending transfers list
    const handleActionCompleted = useCallback(() => {
        setLocalRefetchTrigger(prev => !prev);
        onTransferActionCompleted();
    }, [onTransferActionCompleted]);

    // Effect to trigger refetch when refetchTrigger changes (from parent) or local trigger changes
    useEffect(() => {
        if (refetchTrigger || localRefetchTrigger) {
            refetchAllIds();
            setLocalRefetchTrigger(false);
        }
    }, [refetchTrigger, localRefetchTrigger, refetchAllIds]);

    // Sort the transfer IDs before mapping to ensure stable order for child components
    const sortedTransferIds = [...allRelatedTransferIds].sort((a, b) => {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    });

    return (
        <div style={pendingTransfersContainerStyle}>
            <h2 style={pendingTransfersTitleStyle}>Your Pending Transfers</h2>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see pending transfers.</p>
            ) : isLoadingAllIds ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading pending transfers...</p>
            ) : allIdsError ? (
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading transfers: {allIdsError.message}</p>
            ) : sortedTransferIds.length === 0 ? (
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
                                <th style={tableHeaderStyle}>Creation Time</th>
                                <th style={tableHeaderStyle}>Expiration Time</th>
                                <th style={tableHeaderStyle}>Status</th>
                                <th style={tableHeaderStyle}>Transfer ID</th>
                                <th style={tableHeaderStyle}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Map over sorted IDs and let each row fetch its own details */}
                            {sortedTransferIds.map((transferId, index) => (
                                <PendingTransferRow
                                    key={transferId.toString()}
                                    index={index}
                                    transferId={transferId}
                                    pstContractAddress={pstContractAddressForChain} // Pass as undefined if not ready
                                    chainId={chain?.id} // Pass as undefined if not ready
                                    userAddress={userAddress}
                                    onCancelSuccess={handleActionCompleted}
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

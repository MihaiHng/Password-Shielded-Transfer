// src/components/HistoryTransfers.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useConfig } from 'wagmi';
import { useQueries } from '@tanstack/react-query';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

// Import Font Awesome icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons'; // For the overlapping squares icon

// Import wagmi's readContract action for use inside queryFn
import { readContract } from '@wagmi/core';

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

// --- STYLES FOR HISTORY TRANSFERS SECTION (reusing from previous components for consistency) ---
const historyTransfersContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '1000px',
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const historyTransfersTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const tableContainerStyle: CSSProperties = {
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    overflowX: 'auto', // Ensure table is scrollable on small screens
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
    textAlign: 'center',
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
    gap: '1px',
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

// Define a type for the token objects expected in ALL_NETWORK_TOKENS
interface TokenInfo {
    address: Address;
    symbol: string;
    decimals: number;
    name: string;
    logoURI?: string;
    isNative?: boolean;
}

// --- HISTORY TRANSFER ROW COMPONENT ---
interface HistoryTransferRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address;
    chainId: number;
    userAddress: Address | undefined; // The connected user's address for filtering
    initialTransferDetails: [Address, Address, Address, bigint, bigint, bigint, string] | undefined; // Can be undefined if loading/error
    isLoadingRow: boolean; // Indicates if this specific row's details are loading
    errorRow: Error | null; // Indicates if this specific row's details had an error
}

const HistoryTransferRow: React.FC<HistoryTransferRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
    userAddress,
    initialTransferDetails, // Directly use initial details
    isLoadingRow,
    errorRow,
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    // Handle initial loading/error states for the row itself
    if (isLoadingRow) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={9}>Loading transfer details...</td>
            </tr>
        );
    }

    if (errorRow || !initialTransferDetails) {
        console.error(`HistoryRow ${index}: Error or missing details for transferId: ${transferId}`, errorRow);
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={9}>Error loading transfer details.</td>
            </tr>
        );
    }

    // Destructure only if initialTransferDetails is not null
    const [
        sender,
        receiver,
        tokenAddress,
        amountFromDetails, // This is the 'amount' field from getTransferDetails
        creationTime,
        expiringTime,
        status,
    ] = initialTransferDetails;

    // Fetch the originalAmount from s_originalAmounts mapping
    const { data: originalAmount = 0n, isLoading: isLoadingOriginalAmount, error: originalAmountError } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 's_originalAmounts', // Function name for the public mapping
        args: [transferId],
        chainId: chainId,
        query: {
            enabled: !!pstContractAddress && transferId !== undefined,
            staleTime: Infinity, // Original amount won't change
        }
    }) as { data?: bigint, isLoading: boolean, error?: Error };

    console.log(`HistoryRow ${index}: Raw amount from getTransferDetails: ${amountFromDetails.toString()} (BigInt)`);
    console.log(`HistoryRow ${index}: Fetched originalAmount: ${originalAmount.toString()} (BigInt), Loading: ${isLoadingOriginalAmount}, Error:`, originalAmountError);


    // Determine if it's an ERC20 token (not native ETH)
    const isERC20Token = tokenAddress !== '0x0000000000000000000000000000000000000000'; // Assuming 0x0 is native ETH

    // --- Determine Token Decimals and Symbol ---
    let localTokenSymbol: string | undefined;
    let localTokenDecimals: number | undefined;
    let isLoadingTokenData = false;
    let tokenDataError: Error | undefined;

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
    const { data: fetchedSymbol, isLoading: isSymbolLoading, error: symbolError } = useReadContract({
        address: isERC20Token && localTokenSymbol === undefined ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'symbol',
        chainId: chainId,
        query: {
            enabled: isERC20Token && localTokenSymbol === undefined && !!tokenAddress,
            staleTime: Infinity,
        }
    }) as { data?: string, isLoading: boolean, error?: Error };

    const { data: fetchedDecimals, isLoading: isDecimalsLoading, error: decimalsError } = useReadContract({
        address: isERC20Token && localTokenDecimals === undefined ? tokenAddress : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'decimals',
        chainId: chainId,
        query: {
            enabled: isERC20Token && localTokenDecimals === undefined && !!tokenAddress,
            staleTime: Infinity,
        }
    }) as { data?: number, isLoading: boolean, error?: Error };

    // Update local variables if fetched data is available
    if (fetchedSymbol !== undefined) localTokenSymbol = fetchedSymbol;
    if (fetchedDecimals !== undefined) localTokenDecimals = fetchedDecimals;

    isLoadingTokenData = isSymbolLoading || isDecimalsLoading;
    tokenDataError = symbolError || decimalsError;

    // --- Display Amount Calculation ---
    // Use originalAmount for display if available and not loading/erroring, otherwise fallback
    const amountToDisplay = originalAmount; // Use the fetched originalAmount

    const displayAmount = (localTokenDecimals !== undefined && !isLoadingOriginalAmount && !originalAmountError)
        ? formatUnits(amountToDisplay, localTokenDecimals)
        : (isLoadingTokenData || isLoadingOriginalAmount ? 'Loading...' : 'N/A');

    // Determine if the current user is the sender or receiver for this transfer
    const isRelatedToCurrentUser =
        userAddress?.toLowerCase() === sender.toLowerCase() ||
        userAddress?.toLowerCase() === receiver.toLowerCase();

    if (!isRelatedToCurrentUser) {
        return null;
    }

    // Now, handle loading/error states for token details, only if the row is actually going to render.
    if (isLoadingTokenData || isLoadingOriginalAmount) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={9}>Loading token details...</td>
            </tr>
        );
    }

    if (tokenDataError || originalAmountError) {
        console.error(`HistoryRow ${index}: Error fetching token or original amount details for ${tokenAddress}:`, tokenDataError || originalAmountError);
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={9}>Error fetching token data.</td>
            </tr>
        );
    }

    console.log(`HistoryRow ${index}: Final - Token: ${localTokenSymbol}, Decimals: ${localTokenDecimals}, Formatted Original Amount: ${displayAmount}`);


    return (
        <tr style={tableRowStyle}>
            <td style={tableDataStyle}>{index + 1}</td>
            {/* Sender Column: Show 'You' if sender matches userAddress */}
            <td style={tableDataStyle}>
                {userAddress?.toLowerCase() === sender.toLowerCase() ? "You" : truncateAddress(sender)}
            </td>
            {/* Receiver Column: Show 'You' if receiver matches userAddress */}
            <td style={tableDataStyle}>
                {userAddress?.toLowerCase() === receiver.toLowerCase() ? "You" : truncateAddress(receiver)}
            </td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{localTokenSymbol || 'N/A'}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress, setCopiedAddress);
                        }}
                        style={copyButtonStyle}
                    >
                        {copiedAddress === tokenAddress ? 'Copied!' : <FontAwesomeIcon icon={faCopy} />}
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
                </div>
            </td>
        </tr>
    );
};

interface HistoryTransfersProps {
}

const HistoryTransfers: React.FC<HistoryTransfersProps> = (): React.ReactElement | null => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const config = useConfig();

    const pstContractAddress = getPSTContractAddress(chain?.id);

    const [refetchTrigger, setRefetchTrigger] = useState<boolean>(false);

    const {
        data: allTransfersData,
        isLoading: isLoadingAllTransfers,
        error: allTransfersError,
        refetch: refetchAllTransfers
    } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getAllTransfersByAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!pstContractAddress && isConnected,
            staleTime: 5000,
        }
    }) as { data?: [bigint[], bigint[], bigint[], bigint[]], isLoading: boolean, error: Error | null, refetch: () => void };

    const allUniqueTransferIds = Array.from(new Set([
        ...(allTransfersData?.[0] || []),
        ...(allTransfersData?.[1] || []),
        ...(allTransfersData?.[2] || []),
        ...(allTransfersData?.[3] || []),
    ]));

    const transferDetailsQueries = useQueries({
        queries: allUniqueTransferIds.map((transferId) => ({
            queryKey: ['transferDetails', transferId.toString(), chain?.id, pstContractAddress],
            queryFn: async () => {
                if (!pstContractAddress || transferId === undefined || !chain?.id) {
                    throw new Error("Missing contract address, transfer ID, or chain ID for getTransferDetails.");
                }
                const result = await readContract(config, {
                    address: pstContractAddress,
                    abi: PST_CONTRACT_ABI,
                    functionName: 'getTransferDetails',
                    args: [transferId],
                    chainId: chain?.id,
                });
                return result;
            },
            enabled: !!pstContractAddress && transferId !== undefined && !!chain?.id,
            staleTime: 10000,
        })),
    });

    const historyTransfers = allUniqueTransferIds
        .map((transferId, index) => {
            const queryResult = transferDetailsQueries[index];
            const details = queryResult?.data as [Address, Address, Address, bigint, bigint, bigint, string] | undefined;

            if (queryResult?.isLoading || queryResult?.error || !details) {
                return {
                    transferId,
                    details: undefined,
                    isLoading: queryResult?.isLoading || false,
                    error: queryResult?.error || null
                };
            }

            const [, receiver, , , , , status] = details;

            const isRelatedToCurrentUser = userAddress?.toLowerCase() === details[0].toLowerCase() || userAddress?.toLowerCase() === details[1].toLowerCase();

            if (status === "Pending" || !isRelatedToCurrentUser) {
                return null;
            }

            return { transferId, details, isLoading: false, error: null };
        })
        .filter(Boolean) as { transferId: bigint; details: [Address, Address, Address, bigint, bigint, bigint, string] | undefined; isLoading: boolean; error: Error | null }[];

    historyTransfers.sort((a, b) => {
        if (a.details && b.details) {
            const creationTimeA = a.details[4];
            const creationTimeB = b.details[4];
            if (creationTimeA > creationTimeB) return -1;
            if (creationTimeA < creationTimeB) return 1;
            return 0;
        }
        return 0;
    });

    const isLoadingAnyDetails = transferDetailsQueries.some(query => query.isLoading);
    const hasAnyErrorInDetails = transferDetailsQueries.some(query => query.error);

    let displayErrorMessage: string | null = null;
    if (allTransfersError) {
        displayErrorMessage = allTransfersError.message;
    } else if (hasAnyErrorInDetails) {
        const firstDetailError = transferDetailsQueries.find(query => query.error)?.error;
        displayErrorMessage = firstDetailError?.message || "One or more transfer details failed to load.";
    }

    const handleHistoryRefetch = useCallback(() => {
        setRefetchTrigger(prev => !prev);
    }, []);

    useEffect(() => {
        if (refetchTrigger) {
            refetchAllTransfers();
            setRefetchTrigger(false);
        }
    }, [refetchTrigger, refetchAllTransfers]);


    return (
        <div style={historyTransfersContainerStyle}>
            <h2 style={historyTransfersTitleStyle}>Your Transfer History</h2>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see your transfer history.</p>
            ) : isLoadingAllTransfers || isLoadingAnyDetails ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading transfer history...</p>
            ) : displayErrorMessage ? (
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading history: {displayErrorMessage}</p>
            ) : historyTransfers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>No transfer history found for your address.</p>
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
                                <th style={tableHeaderStyle}>ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyTransfers.map((item, index) => (
                                <HistoryTransferRow
                                    key={item.transferId.toString()}
                                    index={index}
                                    transferId={item.transferId}
                                    pstContractAddress={pstContractAddress as Address}
                                    chainId={chain?.id as number}
                                    userAddress={userAddress}
                                    initialTransferDetails={item.details}
                                    isLoadingRow={item.isLoading}
                                    errorRow={item.error}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default HistoryTransfers;
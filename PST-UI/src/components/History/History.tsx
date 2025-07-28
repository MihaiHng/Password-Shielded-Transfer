// src/components/History/History.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

// Import Font Awesome icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, /*faSyncAlt*/ } from '@fortawesome/free-solid-svg-icons';

// Import ABIs
import abiPstWrapper from '../../utils/abis/abi_pst.json';
import erc20AbiJson from '../../utils/abis/abi_erc20.json';

// Import pre-approved tokens list (needed for token decimals lookup)
import { ALL_NETWORK_TOKENS } from '../../utils/constants/tokenList';

// Import the new CSS Module
import styles from './History.module.css';

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

// --- UTILITY FUNCTIONS ---
const truncateAddress = (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

const copyToClipboard = async (text: string, setShowPopup: React.Dispatch<React.SetStateAction<boolean>>) => {
    try {
        await navigator.clipboard.writeText(text);
        setShowPopup(true);
        setTimeout(() => {
            setShowPopup(false);
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
};

const formatTimestamp = (timestamp: bigint | undefined): string => {
    if (timestamp === undefined || timestamp === 0n) return 'N/A';
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
};

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
    sender: Address;
    receiver: Address;
    tokenAddress: Address;
    amount: bigint;
    creationTime: bigint;
    expiringTime: bigint;
    status: string;
    userAddress: Address | undefined;
    tokenSymbol: string;
    tokenDecimals: number;
    setShowCopiedPopup: React.Dispatch<React.SetStateAction<boolean>>;
}

const HistoryTransferRow: React.FC<HistoryTransferRowProps> = ({
    index,
    transferId,
    sender,
    receiver,
    tokenAddress,
    amount,
    creationTime,
    expiringTime,
    status,
    userAddress,
    tokenSymbol,
    tokenDecimals,
    setShowCopiedPopup,
}) => {
    const [isHovered, setIsHovered] = useState(false);

    const displayAmount = formatUnits(amount, tokenDecimals);

    return (
        <tr className={styles.tableRow}>
            <td className={styles.tableData}>{index + 1}</td>
            <td className={styles.tableData}>
                {userAddress?.toLowerCase() === sender.toLowerCase() ? "You" : truncateAddress(sender)}
            </td>
            <td className={styles.tableData}>
                {userAddress?.toLowerCase() === receiver.toLowerCase() ? "You" : truncateAddress(receiver)}
            </td>
            <td className={styles.tableData}>
                <div className={styles.tokenDisplayContainer}>
                    <span>{tokenSymbol || 'N/A'}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress, setShowCopiedPopup);
                        }}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                        className={styles.copyButton}
                        style={{
                            backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        }}
                    >
                        <FontAwesomeIcon icon={faCopy} />
                    </button>
                </div>
            </td>
            <td className={styles.tableData}>{displayAmount}</td>
            <td className={styles.tableData}>{formatTimestamp(creationTime)}</td>
            <td className={styles.tableData}>{formatTimestamp(expiringTime)}</td>
            <td className={styles.tableData}>{status}</td>
            <td className={styles.tableData}>
                <div className={styles.tokenDisplayContainer}>
                    <span>{transferId.toString()}</span>
                </div>
            </td>
        </tr>
    );
};

interface HistoryTransfersProps {
    componentTitle?: string;
    refetchTrigger?: boolean; // Prop from parent to force refetch
}

const ITEMS_PER_PAGE = 10; // Define how many transfers per page

const HistoryTransfers: React.FC<HistoryTransfersProps> = ({ componentTitle, refetchTrigger }): React.ReactElement | null => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const queryClient = useQueryClient();

    const pstContractAddress = getPSTContractAddress(chain?.id);

    const [showLocalCopiedPopup, setShowLocalCopiedPopup] = useState<boolean>(false);
    const [currentPage, setCurrentPage] = useState(0); // State for current page (0-indexed)
    const [totalTransfersCount, setTotalTransfersCount] = useState<bigint | undefined>(undefined); // State for total count

    // Ref for the debounce timeout
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- Query for total transfers count (still useful for UI total count display) ---
    const { data: totalCountQueryResult, isLoading: isLoadingTotalCount } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getTotalTransfersByAddress',
        args: userAddress ? [userAddress] : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!pstContractAddress && isConnected,
            staleTime: 1000 * 60 * 5, // Total count can be stale longer
            gcTime: 1000 * 60 * 15,
        }
    }) as { data?: bigint, isLoading: boolean };

    useEffect(() => {
        if (totalCountQueryResult !== undefined) {
            setTotalTransfersCount(totalCountQueryResult);
        }
    }, [totalCountQueryResult]);

    // Total pages calculated based on the *full* count
    const totalPages = totalTransfersCount ? Math.ceil(Number(totalTransfersCount) / ITEMS_PER_PAGE) : 0;

    // 1. **MODIFIED**: Get ALL transfer IDs for the user (not paginated by contract anymore)
    // This assumes `getAllTransfersByAddress` can accept a very large limit, or you have
    // another contract function that returns ALL IDs (e.g., `getAllUserTransferIds`).
    // WARNING: This call could hit gas limits if `totalTransfersCount` is large.
    const {
        data: allTransferIdsQueryResult, // Renamed from paginatedTransferIdsQueryResult
        isLoading: isLoadingAllTransferIds, // Renamed
        isFetching: isFetchingAllTransferIds, // Renamed
        error: allTransferIdsError, // Renamed
    } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getAllTransfersByAddress', // Using existing function, but asking for ALL
        args: userAddress && totalTransfersCount !== undefined
            ? [userAddress, 0n, totalTransfersCount] // Fetch ALL using the full count
            : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!pstContractAddress && isConnected && totalTransfersCount !== undefined,
            staleTime: 1000 * 30, // Shorter stale time for current page data
            gcTime: 1000 * 60 * 5,
        }
    }) as {
        data?: bigint[],
        isLoading: boolean,
        isFetching: boolean,
        error: Error | null,
    };

    const allUniqueTransferIds = useMemo(() => {
        if (!allTransferIdsQueryResult) return [];
        return Array.from(new Set(allTransferIdsQueryResult));
    }, [allTransferIdsQueryResult]);


    // 2. Batch fetch ALL transfer details and original amounts for ALL unique IDs
    // WARNING: This will fetch details for *all* transfers, potentially many RPC calls.
    const {
        data: transferDetailsAndAmountsData,
        isLoading: isLoadingDetailsAndAmounts,
        isFetching: isFetchingDetailsAndAmounts,
        error: detailsAndAmountsBatchError,
    } = useReadContracts({
        contracts: allUniqueTransferIds.map((transferId) => ([
            {
                address: pstContractAddress,
                abi: PST_CONTRACT_ABI,
                functionName: 'getTransferDetails',
                args: [transferId],
                chainId: chain?.id,
            },
            {
                address: pstContractAddress,
                abi: PST_CONTRACT_ABI,
                functionName: 's_originalAmounts',
                args: [transferId],
                chainId: chain?.id,
            },
        ])).flat(),
        query: {
            enabled: allUniqueTransferIds.length > 0 && !!pstContractAddress && !!chain?.id,
            staleTime: 1000 * 60 * 1, // 1 minute stale time for details
            gcTime: 1000 * 60 * 5,
        }
    }) as {
        data?: any,
        isLoading: boolean,
        isFetching: boolean,
        isError: boolean,
        error: Error | null,
    };


    // 3. Extract unique token addresses and prepare queries for their symbols/decimals
    const uniqueTokenAddresses = useMemo(() => {
        const addresses = new Set<Address>();
        if (transferDetailsAndAmountsData) {
            for (let i = 0; i < transferDetailsAndAmountsData.length; i += 2) {
                const detailsResult = transferDetailsAndAmountsData[i];
                if (detailsResult.status === 'success' && detailsResult.result) {
                    const tokenAddress = (detailsResult.result as any[])[2] as Address;
                    if (tokenAddress !== '0x0000000000000000000000000000000000000000') {
                        const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id);
                        if (!networkConfig?.tokens.some(t => t.address.toLowerCase() === tokenAddress.toLowerCase())) {
                            addresses.add(tokenAddress);
                        }
                    }
                }
            }
        }
        return Array.from(addresses);
    }, [transferDetailsAndAmountsData, chain?.id]);


    const {
        data: tokenInfoData,
        isLoading: isLoadingTokenInfo,
        isFetching: isFetchingTokenInfo,
        error: tokenInfoBatchError,
    } = useReadContracts({
        contracts: uniqueTokenAddresses.flatMap((tokenAddress) => [
            {
                address: tokenAddress,
                abi: ERC20_CONTRACT_ABI,
                functionName: 'symbol',
                chainId: chain?.id,
            },
            {
                address: tokenAddress,
                abi: ERC20_CONTRACT_ABI,
                functionName: 'decimals',
                chainId: chain?.id,
            },
        ]),
        query: {
            enabled: uniqueTokenAddresses.length > 0 && !!chain?.id,
            staleTime: Infinity,
            gcTime: 1000 * 60 * 60 * 24,
        }
    }) as {
        data?: any,
        isLoading: boolean,
        isFetching: boolean,
        isError: boolean,
        error: Error | null,
    };

    // Overall loading/error status now considers *all* fetches
    const overallIsLoading = isLoadingTotalCount || isLoadingAllTransferIds || isLoadingDetailsAndAmounts || isLoadingTokenInfo;
    const overallHasError = allTransferIdsError || detailsAndAmountsBatchError || tokenInfoBatchError;

    // 4. Consolidate ALL data and SORT it globally by creation time
    const allHistoryTransfers = useMemo(() => { // Renamed from `historyTransfers`
        if (overallIsLoading || overallHasError) return [];

        const processedTransfers: {
            transferId: bigint;
            sender: Address;
            receiver: Address;
            tokenAddress: Address;
            amount: bigint;
            creationTime: bigint;
            expiringTime: bigint;
            status: string;
            tokenSymbol: string;
            tokenDecimals: number;
        }[] = [];

        const fetchedTokenMap = new Map<Address, { symbol: string; decimals: number }>();
        uniqueTokenAddresses.forEach((address, idx) => {
            const symbolResult = tokenInfoData?.[idx * 2];
            const decimalsResult = tokenInfoData?.[idx * 2 + 1];
            if (symbolResult?.status === 'success' && symbolResult.result && decimalsResult?.status === 'success' && decimalsResult.result !== undefined) {
                fetchedTokenMap.set(address, {
                    symbol: symbolResult.result as string,
                    decimals: decimalsResult.result as number,
                });
            }
        });

        // Loop through all fetched IDs and combine with their details
        allUniqueTransferIds.forEach((transferId, index) => {
            const detailsResult = transferDetailsAndAmountsData?.[index * 2];
            const amountResult = transferDetailsAndAmountsData?.[index * 2 + 1];

            if (detailsResult?.status === 'success' && detailsResult.result &&
                amountResult?.status === 'success' && amountResult.result !== undefined) {

                const details = detailsResult.result as [Address, Address, Address, bigint, bigint, bigint, string];
                const originalAmount = amountResult.result as bigint;

                const [sender, receiver, tokenAddress, , creationTime, expiringTime, status] = details;

                const isRelatedToCurrentUser =
                    userAddress?.toLowerCase() === sender.toLowerCase() ||
                    userAddress?.toLowerCase() === receiver.toLowerCase();

                if (!isRelatedToCurrentUser) {
                    return; // Still only show transfers related to the current user
                }

                let tokenSymbol: string | undefined;
                let tokenDecimals: number | undefined;

                if (tokenAddress === '0x0000000000000000000000000000000000000000') {
                    tokenSymbol = 'ETH';
                    tokenDecimals = 18;
                } else {
                    const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id);
                    const localToken = networkConfig?.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) as TokenInfo | undefined;
                    if (localToken) {
                        tokenSymbol = localToken.symbol;
                        tokenDecimals = localToken.decimals;
                    } else {
                        const fetched = fetchedTokenMap.get(tokenAddress);
                        if (fetched) {
                            tokenSymbol = fetched.symbol;
                            tokenDecimals = fetched.decimals;
                        } else {
                            tokenSymbol = 'Unknown';
                            tokenDecimals = 0;
                        }
                    }
                }

                processedTransfers.push({
                    transferId,
                    sender,
                    receiver,
                    tokenAddress,
                    amount: originalAmount,
                    creationTime,
                    expiringTime,
                    status,
                    tokenSymbol: tokenSymbol || 'Unknown',
                    tokenDecimals: tokenDecimals || 0,
                });
            }
        });

        // Sort ALL processed transfers by creation time, newest first
        return processedTransfers.sort((a, b) => {
            if (a.creationTime > b.creationTime) return -1;
            if (a.creationTime < b.creationTime) return 1;
            return 0;
        });

    }, [
        allUniqueTransferIds,
        transferDetailsAndAmountsData,
        tokenInfoData,
        chain?.id,
        userAddress,
        overallIsLoading,
        overallHasError
    ]);

    // NEW: Apply pagination (slicing) AFTER all data has been fetched and sorted
    const paginatedHistoryTransfers = useMemo(() => {
        const startIndex = currentPage * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return allHistoryTransfers.slice(startIndex, endIndex);
    }, [allHistoryTransfers, currentPage]); // Depends on the fully sorted list and current page


    // Use isFetching to control the refresh button and spinner
    const isActivelyFetching = isLoadingTotalCount || isFetchingAllTransferIds || isFetchingDetailsAndAmounts || isFetchingTokenInfo;

    // Function to handle manual refresh
    const handleManualRefresh = useCallback(() => {
        if (!userAddress || !pstContractAddress || !chain?.id) {
            console.warn("Cannot refresh: Wallet not connected or contract address/chain ID missing.");
            return;
        }

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            console.log("Attempting to refetch queries manually...");

            // Refetch total count
            queryClient.refetchQueries({
                queryKey: ['readContract', pstContractAddress, 'getTotalTransfersByAddress', userAddress],
                exact: true,
            }).then(() => console.log('getTotalTransfersByAddress refetch initiated.'));

            // Refetch ALL transfers (updated queryKey structure based on total count)
            // This is crucial for refreshing the full dataset.
            if (totalTransfersCount !== undefined) {
                queryClient.refetchQueries({
                    queryKey: ['readContract', pstContractAddress, 'getAllTransfersByAddress', userAddress, 0n, totalTransfersCount],
                    exact: true,
                }).then(() => console.log('All transfers refetch initiated.'));
            }

            // Other refetches will be triggered by dependency changes
        }, 300); // Debounce refresh calls by 300ms
    }, [queryClient, userAddress, chain?.id, pstContractAddress, totalTransfersCount]); // Add totalTransfersCount to deps


    // Effect to trigger refetch when refetchTrigger prop changes (from parent)
    useEffect(() => {
        if (refetchTrigger) {
            handleManualRefresh();
        }
    }, [refetchTrigger, handleManualRefresh]);

    // Cleanup the debounce timeout when the component unmounts
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);


    const displayedTitle = useMemo(() => {
        return componentTitle || "Your Transfer History";
    }, [componentTitle]);


    let displayErrorMessage: string | null = null;
    if (allTransferIdsError) { // Updated error flag
        displayErrorMessage = allTransferIdsError.message;
    } else if (detailsAndAmountsBatchError) {
        displayErrorMessage = detailsAndAmountsBatchError.message || "One or more transfer details or amounts failed to load.";
    } else if (tokenInfoBatchError) {
        displayErrorMessage = tokenInfoBatchError.message || "One or more token details failed to load.";
    } else if (totalCountQueryResult === undefined && isLoadingTotalCount === false && !!userAddress && !!pstContractAddress) {
        displayErrorMessage = "Failed to load total transfer count. Please try refreshing.";
    }


    return (
        <>
            <div className={styles.historyTransfersContainer}>
                <h2 className={styles.historyTransfersTitle}>{displayedTitle}</h2>
                {/* {isConnected && userAddress && (
                    <button
                        onClick={handleManualRefresh}
                        className={styles.refreshButton}
                        disabled={isActivelyFetching}
                        style={{
                            transform: isActivelyFetching ? 'rotate(360deg)' : 'rotate(0deg)',
                        }}
                    >
                        <FontAwesomeIcon
                            icon={faSyncAlt}
                            spin={isActivelyFetching}
                            style={{ marginRight: '5px' }}
                        />
                        Refresh
                    </button>
                )} */}

                {!isConnected || !userAddress ? (
                    <p className={styles.disconnectedNetwork}>Connect your wallet to see your transfer history.</p>
                ) : overallIsLoading && !paginatedHistoryTransfers.length && !overallHasError ? ( // Check paginated list length
                    <p className={styles.loadingMessage}>Loading transfer history...</p>
                ) : displayErrorMessage ? (
                    <p className={styles.errorMessage}>Error loading history: {displayErrorMessage}</p>
                ) : paginatedHistoryTransfers.length === 0 && !isActivelyFetching && totalTransfersCount !== undefined && Number(totalTransfersCount) > 0 && currentPage >= totalPages ? (
                    <p className={styles.loadingMessage}>No transfers found on this page. Try previous pages.</p>
                ) : paginatedHistoryTransfers.length === 0 && !isActivelyFetching && (totalTransfersCount === undefined || Number(totalTransfersCount) === 0) ? (
                    <p className={styles.loadingMessage}>No transfer history found for your address.</p>
                ) : (
                    <>
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.tableHeader}>Index</th>
                                        <th className={styles.tableHeader}>Sender</th>
                                        <th className={styles.tableHeader}>Receiver</th>
                                        <th className={styles.tableHeader}>Token</th>
                                        <th className={styles.tableHeader}>Amount</th>
                                        <th className={styles.tableHeader}>Creation Time</th>
                                        <th className={styles.tableHeader}>Expiration Time</th>
                                        <th className={styles.tableHeader}>Status</th>
                                        <th className={styles.tableHeader}>ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedHistoryTransfers.map((item, index) => ( // Render from paginated list
                                        <HistoryTransferRow
                                            key={item.transferId.toString()}
                                            index={index + (currentPage * ITEMS_PER_PAGE)} //Adjust index for display
                                            transferId={item.transferId}
                                            sender={item.sender}
                                            receiver={item.receiver}
                                            tokenAddress={item.tokenAddress}
                                            amount={item.amount}
                                            creationTime={item.creationTime}
                                            expiringTime={item.expiringTime}
                                            status={item.status}
                                            userAddress={userAddress}
                                            tokenSymbol={item.tokenSymbol}
                                            tokenDecimals={item.tokenDecimals}
                                            setShowCopiedPopup={setShowLocalCopiedPopup}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {totalTransfersCount !== undefined && totalPages > 0 && (
                            <div className={styles.paginationContainer}>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                                    disabled={currentPage === 0 || isActivelyFetching}
                                    className={styles.paginationButton}
                                >
                                    Previous
                                </button>
                                <span className={styles.paginationText}>
                                    Page {currentPage + 1} of {totalPages} (Total: {totalTransfersCount?.toString()})
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                                    disabled={currentPage >= totalPages - 1 || isActivelyFetching}
                                    className={styles.paginationButton}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className={`${styles.copiedPopup} ${showLocalCopiedPopup ? styles.copiedPopupVisible : ''}`}>
                Address Copied!
            </div>
        </>
    );
};

export default HistoryTransfers;
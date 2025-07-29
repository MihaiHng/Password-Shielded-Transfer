// src/components/PendingTransfers.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract, useConfig, useToken } from 'wagmi';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

import abiPstWrapper from '../../utils/abis/abi_pst.json'; // Adjusted path if needed

import CancelTransferButton from '../CancelTransferButton/CancelTransferButton'; // Adjusted path if needed
import ClaimTransferButton from '../ClaimTransferButton/ClaimTransferButton'; // Adjusted path if needed

// Import the CSS Module
import styles from './PendingTransfers.module.css';

// Import useQueryClient
import { useQueryClient } from '@tanstack/react-query';


const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

const PST_CONTRACT_ADDRESS_SEPOLIA = import.meta.env.VITE_PST_ETH_SEPOLIA_ADDRESS as `0x${string}`;
const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA = import.meta.env.VITE_PST_ZKSYNC_SEPOLIA_ADDRESS as `0x${string}`;

const getPSTContractAddress = (chainId: number | undefined): Address | undefined => {
    switch (chainId) {
        case 11155111: return PST_CONTRACT_ADDRESS_SEPOLIA;
        case 300: return PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA;
        default: return undefined;
    }
};

const truncateAddress = (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

const copyToClipboard = async (text: string, setShowCopiedPopup: React.Dispatch<React.SetStateAction<boolean>>) => {
    try {
        await navigator.clipboard.writeText(text);
        setShowCopiedPopup(true);
        setTimeout(() => {
            setShowCopiedPopup(false);
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy address. Please try again.');
    }
};

const formatTimestamp = (timestamp: bigint | undefined): string => {
    if (timestamp === undefined || timestamp === 0n) return 'N/A';
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
};

const formatTime = (seconds: number): string => {
    if (seconds <= 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s]
        .map(v => v < 10 ? '0' + v : v)
        .join(':');
};

const formatSecondsToMinutes = (seconds: bigint | undefined): string => {
    if (seconds === undefined || seconds === 0n) return "0";
    const minutes = Number(seconds) / 60;
    return minutes.toFixed(0);
};

// --- PENDING TRANSFERS MAIN COMPONENT PROPS MOVED HERE ---
interface PendingTransfersProps {
    pstContractAddress: Address | undefined;
    // refetchTrigger: boolean; // Removed this prop
    type: "sent" | "received" | "all";
    onTransferActionCompleted: (transferId: bigint) => void;
    componentTitle?: string;
    cancelCooldownPeriod?: bigint;
    isLoadingCancelCooldown?: boolean;
    cancelCooldownError?: Error;
}

interface PendingTransferRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address | undefined;
    chainId: number | undefined;
    userAddress: Address | undefined;
    onActionSuccess: (transferId: bigint) => void;
    type: "sent" | "received" | "all";
    cancelCooldownDuration: bigint | undefined;
    setShowCopiedPopup: React.Dispatch<React.SetStateAction<boolean>>;
}

const PendingTransferRow: React.FC<PendingTransferRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
    userAddress,
    onActionSuccess,
    type,
    cancelCooldownDuration,
    setShowCopiedPopup,
}) => {
    const [password, setPassword] = useState<string>('');
    const config = useConfig();
    const [, setIsCopyButtonHovered] = useState(false);

    const areRowContractDetailsReady = !!pstContractAddress && !!chainId && !!config;
    type ContractTransferDetails = [Address, Address, Address, bigint, bigint, bigint, string];

    const { data: transferDetails, isLoading: isDetailsLoading, error: detailsError } = useReadContract({
        address: areRowContractDetailsReady ? pstContractAddress : undefined,
        abi: PST_CONTRACT_ABI,
        functionName: 'getTransferDetails',
        args: [transferId],
        chainId: areRowContractDetailsReady ? chainId : undefined,
        query: {
            enabled: areRowContractDetailsReady && transferId !== undefined,
            staleTime: 10_000,
        },
    }) as { data?: ContractTransferDetails, isLoading: boolean, error?: Error };

    const sender = transferDetails?.[0];
    const receiver = transferDetails?.[1];
    const tokenAddress = transferDetails?.[2];
    const amount = transferDetails?.[3];
    const creationTime = transferDetails?.[4];
    const expiringTime = transferDetails?.[5];
    const statusFromContract = transferDetails?.[6];

    let statusString: string = "Unknown";
    if (typeof statusFromContract === 'string' &&
        ['Pending', 'Claimed', 'Canceled', 'Expired', 'ExpiredAndRefunded'].includes(statusFromContract)) {
        statusString = statusFromContract;
    }

    const isNativeToken = tokenAddress?.toLowerCase() === '0x0000000000000000000000000000000000000000';

    const { data: erc20TokenData, isLoading: isErc20TokenLoading, error: erc20TokenError } = useToken({
        address: (!isNativeToken && tokenAddress) ? tokenAddress : undefined,
        chainId: chainId,
        query: {
            enabled: !isNativeToken && !!tokenAddress && !!chainId,
            staleTime: 10_000,
        }
    });

    const tokenInfo = useMemo(() => {
        if (isNativeToken) {
            const currentChain = config.chains.find(c => c.id === chainId);
            if (currentChain) {
                return {
                    symbol: currentChain.nativeCurrency.symbol || 'ETH',
                    decimals: currentChain.nativeCurrency.decimals || 18,
                    isNative: true
                };
            }
        } else if (erc20TokenData) {
            return {
                symbol: erc20TokenData.symbol,
                decimals: erc20TokenData.decimals,
                isNative: false
            };
        } else if (erc20TokenError) {
            console.error(`Error fetching ERC20 token data for ${tokenAddress}:`, erc20TokenError);
            return null;
        }
        return null;
    }, [isNativeToken, erc20TokenData, erc20TokenError, config, chainId, tokenAddress]);

    const isTokenInfoLoading = isErc20TokenLoading || (isNativeToken && !tokenInfo);
    const tokenInfoError = erc20TokenError || (isNativeToken && !tokenInfo && !!tokenAddress ? new Error("Native token details unavailable") : null);

    const shouldRender = useMemo(() => {
        if (isDetailsLoading || !transferDetails) return true;

        // Ensure we only render rows that are relevant based on their actual status and the table's type.
        // For a new transfer, its status will be "Pending".
        if (statusString !== "Pending" && statusString !== "Expired") {
            return false;
        }

        if (!userAddress) return false;

        if (type === "sent") {
            return userAddress.toLowerCase() === sender?.toLowerCase();
        } else if (type === "received") {
            return userAddress.toLowerCase() === receiver?.toLowerCase();
        } else if (type === "all") {
            return true;
        }
        return false;
    }, [type, userAddress, sender, receiver, statusString, isDetailsLoading, transferDetails]);

    const [timeToClaimRemaining, setTimeToClaimRemaining] = useState<number>(0);
    const claimCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const claimableTimestamp = useMemo(() => {
        if (creationTime !== undefined && cancelCooldownDuration !== undefined) {
            return creationTime + cancelCooldownDuration;
        }
        return undefined;
    }, [creationTime, cancelCooldownDuration]);

    useEffect(() => {
        if (claimableTimestamp !== undefined) {
            const targetTimestamp = Number(claimableTimestamp);
            const updateCountdown = () => {
                const nowInSeconds = Math.floor(Date.now() / 1000);
                const remaining = targetTimestamp - nowInSeconds;
                setTimeToClaimRemaining(Math.max(0, remaining));

                if (remaining <= 0 && claimCountdownIntervalRef.current) {
                    clearInterval(claimCountdownIntervalRef.current);
                    claimCountdownIntervalRef.current = null;
                }
            };

            if (claimCountdownIntervalRef.current) {
                clearInterval(claimCountdownIntervalRef.current);
            }

            if (targetTimestamp * 1000 > Date.now()) {
                updateCountdown();
                claimCountdownIntervalRef.current = setInterval(updateCountdown, 1000);
            } else {
                setTimeToClaimRemaining(0);
            }
        } else {
            setTimeToClaimRemaining(0);
        }

        return () => {
            if (claimCountdownIntervalRef.current) {
                clearInterval(claimCountdownIntervalRef.current);
            }
        };
    }, [claimableTimestamp]);

    const isClaimableNow = timeToClaimRemaining <= 0;

    // Use CSS Module classes instead of inline styles
    if (isDetailsLoading) {
        return (
            <tr className={styles.tableRow}>
                <td className={styles.tableData}>{index + 1}</td>
                <td className={styles.tableData} colSpan={9}>Loading transfer details...</td>
            </tr>
        );
    }

    if (detailsError || !transferDetails || statusString === "Unknown") {
        console.error("Error fetching transfer details for ID", transferId, detailsError || "Transfer details missing/invalid.");
        return (
            <tr className={styles.tableRow}>
                <td className={`${styles.tableData} ${styles.error}`} colSpan={9}>Error loading transfer details.</td>
            </tr>
        );
    }

    if (!shouldRender) {

        return null;
    }

    if (isTokenInfoLoading) {
        return (
            <tr className={styles.tableRow}>
                <td className={styles.tableData}>{index + 1}</td>
                <td className={styles.tableData} colSpan={9}>Loading token details...</td>
            </tr>
        );
    }

    if (tokenInfoError || !tokenInfo) {
        console.error("Error fetching token details for", tokenAddress, tokenInfoError);
        return (
            <tr className={styles.tableRow}>
                <td className={`${styles.tableData} ${styles.error}`} colSpan={9}>Error fetching token data.</td>
            </tr>
        );
    }

    const displayAmount = (amount && tokenInfo.decimals !== undefined) ? formatUnits(amount, tokenInfo.decimals) : 'N/A';

    const showCancelButton = type === "sent" && userAddress?.toLowerCase() === sender?.toLowerCase();
    const showClaimButton = type === "received" && userAddress?.toLowerCase() === receiver?.toLowerCase();

    return (
        <tr className={styles.tableRow}>
            <td className={styles.tableData}>{index + 1}</td>
            <td className={styles.tableData}>
                {userAddress?.toLowerCase() === sender?.toLowerCase() ? "You" : truncateAddress(sender || 'N/A')}
            </td>
            <td className={styles.tableData}>
                {userAddress?.toLowerCase() === receiver?.toLowerCase() ? "You" : truncateAddress(receiver || 'N/A')}
            </td>
            <td className={styles.tableData}>
                <div className={styles.tokenDisplayContainer}>
                    <span>{tokenInfo.symbol || 'ETH'}</span>
                    <button
                        className={styles.copyButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress || '', setShowCopiedPopup);
                        }}
                        onMouseEnter={() => setIsCopyButtonHovered(true)}
                        onMouseLeave={() => setIsCopyButtonHovered(false)}
                    >
                        <FontAwesomeIcon icon={faCopy} />
                    </button>
                </div>
            </td>
            <td className={styles.tableData}>{displayAmount}</td>
            <td className={styles.tableData}>{formatTimestamp(creationTime)}</td>
            <td className={styles.tableData}>{formatTimestamp(expiringTime)}</td>
            <td className={styles.tableData}>{statusString}</td>
            <td className={styles.tableData}>
                <div className={styles.tokenDisplayContainer}>
                    <span>{transferId.toString()}</span>
                </div>
            </td>
            <td className={styles.actionTableCell}> {/* This TD is the flex container */}
                {userAddress && pstContractAddress && chainId ? (
                    <>
                        {showCancelButton && (
                            <div className={styles.actionButtonWrapper}> {/* Wrapper for Cancel button */}
                                <CancelTransferButton
                                    transferId={transferId}
                                    pstContractAddress={pstContractAddress}
                                    chainId={chainId}
                                    senderAddress={sender || '0x0'}
                                    transferStatus={statusString}
                                    creationTime={creationTime || 0n}
                                    cancelationCooldown={expiringTime || 0n}
                                    onCancelActionCompleted={() => onActionSuccess(transferId)}
                                />
                            </div>
                        )}

                        {showClaimButton && (
                            <>
                                {!isClaimableNow ? (
                                    <span className={styles.claimableCountdown}>
                                        Claimable in {formatTime(timeToClaimRemaining)}
                                    </span>
                                ) : (
                                    <>
                                        <input
                                            type="password"
                                            className={styles.passwordInput}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter password"
                                        />
                                        <div className={styles.actionButtonWrapper}> {/* Wrapper for Claim button */}
                                            <ClaimTransferButton
                                                transferId={transferId}
                                                pstContractAddress={pstContractAddress}
                                                chainId={chainId}
                                                password={password}
                                                receiverAddress={receiver || '0x0'}
                                                transferStatus={statusString}
                                                creationTime={creationTime || 0n}
                                                onClaimActionCompleted={() => onActionSuccess(transferId)}
                                            />
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                        {!showCancelButton && !showClaimButton && (
                            <span className={styles.noActionText}>No action</span>
                        )}
                    </>
                ) : (
                    <span className={styles.noActionText}>Connect wallet for actions</span>
                )}
            </td>
        </tr>
    );
};


// --- PENDING TRANSFERS MAIN COMPONENT ---
const PendingTransfers: React.FC<PendingTransfersProps> = ({
    //pstContractAddress,
    // refetchTrigger, // Removed from props
    type,
    onTransferActionCompleted,
    componentTitle,
    cancelCooldownPeriod,
    isLoadingCancelCooldown,
    cancelCooldownError
}) => {
    const { address: userAddress, chain, isConnected } = useAccount();
    //const config = useConfig();
    const queryClient = useQueryClient(); // Initialize useQueryClient
    const [transferIds, setTransferIds] = useState<bigint[]>([]);
    const [idsFetchError, setIdsFetchError] = useState<Error | null>(null);

    const pstContractAddressForChain = useMemo(() => getPSTContractAddress(chain?.id), [chain?.id]);
    const [showGlobalCopiedPopup, setShowGlobalCopiedPopup] = useState(false);

    // Removed: Ref for the debounce timeout for refetchIds (no longer needed)

    // --- MODIFIED getFunctionName ---
    const getFunctionName = useCallback(() => {
        if (type === "sent" || type === "received") {
            return 'getPendingTransfersForAddress';
        }
        return 'getPendingTransfers';
    }, [type]);

    // --- MODIFIED getFunctionArgs ---
    const getFunctionArgs = useCallback(() => {
        if (type === "sent" || type === "received") {
            return userAddress ? [userAddress] : undefined;
        }
        return undefined;
    }, [type, userAddress]);

    const {
        data: fetchedIdsData,
        isLoading: isLoadingIds,
        error: fetchIdsError,
        //refetch: refetchIds // Still available if needed for internal, non-action-based refetch
    } = useReadContract({
        address: pstContractAddressForChain,
        abi: PST_CONTRACT_ABI,
        functionName: getFunctionName(),
        args: getFunctionArgs(),
        chainId: chain?.id,
        query: {
            enabled: isConnected && !!pstContractAddressForChain && (type === "all" || !!userAddress),
            staleTime: 10_000, // Data will be considered fresh for 10 seconds
            refetchOnWindowFocus: true,
            select: (data: any) => {
                if (!Array.isArray(data)) {
                    console.error(`[PendingTransfers:select] Expected array for '${getFunctionName()}', got:`, data);
                    throw new Error(`Invalid data format from ${getFunctionName()}`);
                }
                return data as bigint[];
            }
        },
    });

    useEffect(() => {
        if (fetchIdsError) {
            console.error("[PendingTransfers] Error fetching transfer IDs from contract:", fetchIdsError);
            setIdsFetchError(fetchIdsError);
            setTransferIds([]);
        } else if (fetchedIdsData !== undefined) {
            console.log("[PendingTransfers] fetchedIdsData updated:", fetchedIdsData);
            setTransferIds(fetchedIdsData);
            setIdsFetchError(null);
        }
    }, [fetchedIdsData, fetchIdsError]);

    // Removed: useEffect dependent on refetchTrigger
    // The previous useEffect block for refetchTrigger is removed as this pattern is replaced by invalidateQueries.


    const handleActionCompleted = useCallback((transferId: bigint) => {
        console.log(`[PendingTransfers] handleActionCompleted called for ID: ${transferId}. Notifying parent and invalidating pending transfers query.`);
        onTransferActionCompleted(transferId);

        // Invalidate the query for pending transfers
        // This tells React Query to refetch the data the next time this query is observed.
        queryClient.invalidateQueries({
            queryKey: ['readContract', {
                address: pstContractAddressForChain,
                abi: PST_CONTRACT_ABI,
                functionName: getFunctionName(),
                args: getFunctionArgs(),
                chainId: chain?.id
            }],
            refetchType: 'active' // Only refetch currently active/mounted queries
        });

    }, [onTransferActionCompleted, queryClient, pstContractAddressForChain, PST_CONTRACT_ABI, getFunctionName, getFunctionArgs, chain?.id]);

    useEffect(() => {
        // This useEffect is now empty or can be removed if no other side effects are handled.
        // Keeping it if other unrelated cleanups might be added in the future.
        return () => {
            // No specific cleanup for debounceRefetchTimeout needed anymore
        };
    }, []);


    const sortedTransferIds = useMemo(() => {
        //const validIds = transferIds.filter(id => id !== 0n);
        //console.log("[PendingTransfers] Sorted transfer IDs after filter:", validIds);
        return [...transferIds].sort((a, b) => {
            if (a > b) return -1;
            if (a < b) return 1;
            return 0;
        });
    }, [transferIds]);

    const displayedTitle = useMemo(() => {
        if (componentTitle) return componentTitle;
        switch (type) {
            case "sent": return "Your Sent Pending Transfers";
            case "received": return "Your Received Pending Transfers";
            case "all": return "All System Pending Transfers";
            default: return "Pending Transfers";
        }
    }, [type, componentTitle]);


    if (!isConnected || (!userAddress && type !== "all")) {
        return (
            <div className={styles.pendingpendingTransfersContainer}>
                <h2 className={styles.pendingTransfersTitle}>{displayedTitle}</h2>
                <p className={styles.disconnectedNetworkMessage}>Connect your wallet to see pending transfers.</p>
            </div>
        );
    }

    if (isLoadingIds || isLoadingCancelCooldown) {
        return (
            <div className={styles.pendingTransfersContainer}>
                <h2 className={styles.pendingTransfersTitle}>{displayedTitle}</h2>
                {isLoadingCancelCooldown && (
                    <p className={styles.informativeText}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        Loading cancellation window...
                    </p>
                )}
                <p className={styles.noTransfersMessage}>Loading transfer IDs or cooldown period...</p>
            </div>
        );
    }

    if (idsFetchError || cancelCooldownError) {
        return (
            <div className={styles.pendingTransfersContainer}>
                <h2 className={styles.pendingTransfersTitle}>{displayedTitle}</h2>
                {cancelCooldownError && (
                    <p className={`${styles.informativeText} ${styles.error}`}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        Could not load cancellation window.
                    </p>
                )}
                <p className={`${styles.noTransfersMessage} ${styles.error}`}>Error loading transfers: {idsFetchError?.message || cancelCooldownError?.message}</p>
            </div>
        );
    }

    const hasTransfersToRender = sortedTransferIds.length > 0;
    const cancelCooldownMinutes = formatSecondsToMinutes(cancelCooldownPeriod);

    return (
        <>
            <div className={styles.pendingTransfersContainer}>
                <h2 className={styles.pendingTransfersTitle}>{displayedTitle}</h2>

                {type === "sent" && userAddress && !isLoadingCancelCooldown && cancelCooldownPeriod !== undefined && (
                    <p className={styles.informativeText}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        You have <strong>{cancelCooldownMinutes} minutes</strong> from <strong>Creation Time</strong>
                        to <strong>CANCEL</strong> your transfer.
                    </p>
                )}
                {!hasTransfersToRender ? (
                    <p className={styles.noTransfersMessage}>No pending transfers found.</p>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.styledTable}>
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
                                    <th className={styles.tableHeader}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTransferIds.map((transferId, index) => (
                                    <PendingTransferRow
                                        key={transferId.toString()}
                                        index={index}
                                        transferId={transferId}
                                        pstContractAddress={pstContractAddressForChain}
                                        chainId={chain?.id}
                                        userAddress={userAddress}
                                        onActionSuccess={handleActionCompleted}
                                        type={type}
                                        cancelCooldownDuration={cancelCooldownPeriod}
                                        setShowCopiedPopup={setShowGlobalCopiedPopup}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className={`${styles.copiedPopup} ${showGlobalCopiedPopup ? styles.show : ''}`}>
                Address Copied!
            </div>
        </>
    );
};

export default PendingTransfers;
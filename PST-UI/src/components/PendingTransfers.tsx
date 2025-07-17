// src/components/PendingTransfers.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract, useConfig, useToken } from 'wagmi';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

import CancelTransferButton from './CancelTransferButton';
import ClaimTransferButton from './ClaimTransferButton';

const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

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
    const [isCopyButtonHovered, setIsCopyButtonHovered] = useState(false);

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

    const tableRowStyle: React.CSSProperties = {
        borderBottom: '1px solid #3a3a3a',
    };
    const tableDataStyle: React.CSSProperties = {
        padding: '12px 15px',
        fontSize: '14px',
        color: '#eee',
        verticalAlign: 'middle',
    };
    const tokenDisplayContainerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '1px',
    };
    const passwordInputStyle: React.CSSProperties = {
        width: '110px',
        padding: '8px 12px',
        background: '#3a3a3a',
        border: '1px solid #555',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '12px',
        outline: 'none',
        // Removed marginTop from here, will be handled by password input's marginBottom
        // or the button's wrapper marginTop
    };

    const copyButtonStyle: React.CSSProperties = {
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
        transition: 'background-color 0.2s ease, outline 0.1s ease',
        backgroundColor: isCopyButtonHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        outline: 'none',
        boxShadow: 'none',
    };

    // Style for the Action Column TD - remains the same
    const actionTableCellStyle: React.CSSProperties = {
        ...tableDataStyle,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '80px',
        textAlign: 'center',
    };

    // NEW wrapper style for action buttons (Cancel & Claim)
    const actionButtonWrapperStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column', // Stack contents (button and error message) vertically
        alignItems: 'center',    // Center contents horizontally
        width: '100%',           // Ensure it takes full width within the TD
        // This will be applied to the div wrapping CancelTransferButton and ClaimTransferButton
        // Specific margins like marginTop for Claim will be handled per case below.
    };


    if (isDetailsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={9}>Loading transfer details...</td>
            </tr>
        );
    }

    if (detailsError || !transferDetails || statusString === "Unknown") {
        console.error("Error fetching transfer details for ID", transferId, detailsError || "Transfer details missing/invalid.");
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={9}>Error loading transfer details.</td>
            </tr>
        );
    }

    if (!shouldRender) {
        return null;
    }

    if (isTokenInfoLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={9}>Loading token details...</td>
            </tr>
        );
    }

    if (tokenInfoError || !tokenInfo) {
        console.error("Error fetching token details for", tokenAddress, tokenInfoError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={9}>Error fetching token data.</td>
            </tr>
        );
    }

    const displayAmount = (amount && tokenInfo.decimals !== undefined) ? formatUnits(amount, tokenInfo.decimals) : 'N/A';

    const showCancelButton = type === "sent" && userAddress?.toLowerCase() === sender?.toLowerCase();
    const showClaimButton = type === "received" && userAddress?.toLowerCase() === receiver?.toLowerCase();

    return (
        <tr style={tableRowStyle}>
            <td style={tableDataStyle}>{index + 1}</td>
            <td style={tableDataStyle}>
                {userAddress?.toLowerCase() === sender?.toLowerCase() ? "You" : truncateAddress(sender || 'N/A')}
            </td>
            <td style={tableDataStyle}>
                {userAddress?.toLowerCase() === receiver?.toLowerCase() ? "You" : truncateAddress(receiver || 'N/A')}
            </td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{tokenInfo.symbol || 'ETH'}</span>
                    <button
                        style={copyButtonStyle}
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
            <td style={tableDataStyle}>{displayAmount}</td>
            <td style={tableDataStyle}>{formatTimestamp(creationTime)}</td>
            <td style={tableDataStyle}>{formatTimestamp(expiringTime)}</td>
            <td style={tableDataStyle}>{statusString}</td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{transferId.toString()}</span>
                </div>
            </td>
            <td style={actionTableCellStyle}> {/* This TD is the flex container */}
                {userAddress && pstContractAddress && chainId ? (
                    <>
                        {showCancelButton && (
                            <div style={actionButtonWrapperStyle}> {/* Wrapper for Cancel button */}
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
                                    <span style={{ color: '#FFD700', fontSize: '13px', fontWeight: 'bold' }}>
                                        Claimable in {formatTime(timeToClaimRemaining)}
                                    </span>
                                ) : (
                                    <>
                                        <input
                                            type="password"
                                            style={{ ...passwordInputStyle, marginBottom: '10px' }} // Add margin-bottom here
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter password"
                                        />
                                        <div style={actionButtonWrapperStyle}> {/* Wrapper for Claim button */}
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
                            <span style={{ color: '#888', fontSize: '12px' }}>No action</span>
                        )}
                    </>
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
    type: "sent" | "received" | "all";
    onTransferActionCompleted: (transferId: bigint) => void;
    componentTitle?: string;
    cancelCooldownPeriod?: bigint;
    isLoadingCancelCooldown?: boolean;
    cancelCooldownError?: Error;
}

const PendingTransfers: React.FC<PendingTransfersProps> = ({
    pstContractAddress,
    refetchTrigger,
    type,
    onTransferActionCompleted,
    componentTitle,
    cancelCooldownPeriod,
    isLoadingCancelCooldown,
    cancelCooldownError
}) => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const config = useConfig();
    const [transferIds, setTransferIds] = useState<bigint[]>([]);
    const [idsFetchError, setIdsFetchError] = useState<Error | null>(null);

    const pstContractAddressForChain = useMemo(() => getPSTContractAddress(chain?.id), [chain?.id]);
    const [showGlobalCopiedPopup, setShowGlobalCopiedPopup] = useState(false);

    const getFunctionName = useCallback(() => {
        if (type === "all") {
            return 'getPendingTransfers';
        }
        return 'getAllTransfersByAddress';
    }, [type]);

    const getFunctionArgs = useCallback(() => {
        if (type === "all") {
            return undefined;
        }
        return userAddress ? [userAddress] : undefined;
    }, [type, userAddress]);

    const {
        data: fetchedIdsData,
        isLoading: isLoadingIds,
        error: fetchIdsError,
        refetch: refetchIds
    } = useReadContract({
        address: pstContractAddressForChain,
        abi: PST_CONTRACT_ABI,
        functionName: getFunctionName(),
        args: getFunctionArgs(),
        chainId: chain?.id,
        query: {
            enabled: isConnected && !!pstContractAddressForChain && (type === "all" || !!userAddress),
            staleTime: 5_000,
            refetchOnWindowFocus: false,
            select: (data: any) => {
                if (type === "all") {
                    if (!Array.isArray(data)) {
                        console.error("[PendingTransfers:select] Expected array for 'getPendingTransfers', got:", data);
                        throw new Error("Invalid data format from getPendingTransfers");
                    }
                    return data as bigint[];
                }
                if (!Array.isArray(data) || data.length < 1 || !Array.isArray(data[0])) {
                    console.error("[PendingTransfers:select] Expected array of arrays for 'getAllTransfersByAddress', got:", data);
                    throw new Error("Invalid data format from getAllTransfersByAddress");
                }
                return data[0] as bigint[];
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

    useEffect(() => {
        console.log("[PendingTransfers] refetch useEffect triggered. Current state:", { refetchTrigger, userAddress, isConnected, pstContractAddressForChain, type });
        if (isConnected && userAddress && pstContractAddressForChain) {
            console.log("[PendingTransfers] Calling refetchIds()");
            refetchIds();
        } else if (!userAddress && type === "all" && isConnected && pstContractAddressForChain) {
            console.log("[PendingTransfers] Calling refetchIds() for 'all' type (no userAddress needed).");
            refetchIds();
        }
        else {
            console.log("[PendingTransfers] Skipping refetchIds - conditions not met.");
        }
    }, [refetchTrigger, userAddress, isConnected, pstContractAddressForChain, refetchIds, type]);

    const handleActionCompleted = useCallback((transferId: bigint) => {
        console.log(`[PendingTransfers] handleActionCompleted called for ID: ${transferId}. Notifying parent and initiating refetch.`);
        onTransferActionCompleted(transferId);
        refetchIds();
    }, [onTransferActionCompleted, refetchIds]);

    const sortedTransferIds = useMemo(() => {
        const validIds = transferIds.filter(id => id !== 0n);
        console.log("[PendingTransfers] Sorted transfer IDs after filter:", validIds);
        return [...validIds].sort((a, b) => {
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

    const pendingTransfersContainerStyle: React.CSSProperties = {
        background: '#1b1b1b',
        borderRadius: '20px',
        padding: '24px',
        maxWidth: '1000px',
        margin: '40px auto',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
    };

    const pendingTransfersTitleStyle: React.CSSProperties = {
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '20px',
        textAlign: 'center',
        color: '#fff',
    };

    const informativeTextStyle: React.CSSProperties = {
        fontSize: '13px',
        color: '#00FF00',
        textAlign: 'center',
        marginBottom: '15px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '8px 15px',
        backgroundColor: 'rgba(0, 255, 0, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(0, 255, 0, 0.3)',
        width: 'fit-content',
        margin: '0 auto 15px auto'
    };

    const tableContainerStyle: React.CSSProperties = {
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        overflowX: 'auto',
    };

    const styledTableStyle: React.CSSProperties = {
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: '0',
        backgroundColor: '#2c2c2c',
        borderRadius: '12px',
    };

    const tableHeaderStyle: React.CSSProperties = {
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

    const disconnectedNetworkMessageStyle: React.CSSProperties = {
        fontSize: '14px',
        color: 'red',
        textAlign: 'center',
        marginBottom: '20px',
    };

    const copiedPopupStyle: React.CSSProperties = {
        position: 'fixed',
        top: '20px',
        left: '20px',
        transform: 'none',
        backgroundColor: '#E0E0E0',
        color: '#333',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 'bold',
        zIndex: 10000,
        opacity: showGlobalCopiedPopup ? 1 : 0,
        visibility: showGlobalCopiedPopup ? 'visible' : 'hidden',
        transition: 'opacity 0.3s ease, visibility 0.3s ease',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
        textAlign: 'center',
    };

    if (!isConnected || (!userAddress && type !== "all")) {
        return (
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{displayedTitle}</h2>
                <p style={disconnectedNetworkMessageStyle}>Connect your wallet to see pending transfers.</p>
            </div>
        );
    }

    if (isLoadingIds || isLoadingCancelCooldown) {
        return (
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{displayedTitle}</h2>
                {isLoadingCancelCooldown && (
                    <p style={informativeTextStyle}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        Loading cancellation window...
                    </p>
                )}
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading transfer IDs or cooldown period...</p>
            </div>
        );
    }

    if (idsFetchError || cancelCooldownError) {
        return (
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{displayedTitle}</h2>
                {cancelCooldownError && (
                    <p style={{ ...informativeTextStyle, color: 'red', backgroundColor: 'rgba(255, 0, 0, 0.1)', borderColor: 'rgba(255, 0, 0, 0.3)' }}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        Could not load cancellation window.
                    </p>
                )}
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading transfers: {idsFetchError?.message || cancelCooldownError?.message}</p>
            </div>
        );
    }

    const hasTransfersToRender = sortedTransferIds.length > 0;
    const cancelCooldownMinutes = formatSecondsToMinutes(cancelCooldownPeriod);

    return (
        <>
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{displayedTitle}</h2>

                {type === "sent" && userAddress && !isLoadingCancelCooldown && cancelCooldownPeriod !== undefined && (
                    <p style={informativeTextStyle}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        You have <strong>{cancelCooldownMinutes} minutes</strong> from <strong>Creation Time</strong>
                        to <strong>CANCEL</strong> your transfer.
                    </p>
                )}

                {!hasTransfersToRender ? (
                    <p style={{ textAlign: 'center', color: '#ccc' }}>No pending transfers found.</p>
                ) : (
                    <div style={tableContainerStyle}>
                        <table style={styledTableStyle}>
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
                                    <th style={tableHeaderStyle}>Action</th>
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

            <div style={copiedPopupStyle}>
                Address Copied!
            </div>
        </>
    );
};

export default PendingTransfers;
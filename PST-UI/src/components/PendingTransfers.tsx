// src/components/PendingTransfers.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract, useConfig, useToken } from 'wagmi';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

// Import Font Awesome icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons'; // For the overlapping squares icon

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import the new CancelTransferButton component
import CancelTransferButton from './CancelTransferButton';
// Import the ClaimTransferButton component
import ClaimTransferButton from './ClaimTransferButton'; // Make sure this path is correct

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
    maxWidth: '1000px',
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
    overflowX: 'auto',
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

const passwordInputStyle: CSSProperties = {
    width: '100px', // Adjusted width for password input
    padding: '8px 12px',
    background: '#3a3a3a',
    border: '1px solid #555',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px', // Adjusted font size
    outline: 'none',
    marginTop: '8px', // Added some top margin for spacing
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
interface PendingTransferRowProps {
    index: number;
    transferId: bigint;
    pstContractAddress: Address | undefined;
    chainId: number | undefined;
    userAddress: Address | undefined;
    onActionSuccess: (transferId: bigint) => void;
    type: "sent" | "received" | "all"; // This type determines filtering and action visibility
}

const PendingTransferRow: React.FC<PendingTransferRowProps> = ({
    index,
    transferId,
    pstContractAddress,
    chainId,
    userAddress,
    onActionSuccess,
    type,
}) => {
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [password, setPassword] = useState<string>(''); // State for password input
    const config = useConfig();
    const { chain } = useAccount(); // Get current chain from useAccount for native currency info

    // Determine if contract details and chain ID are ready for any read operations in this row
    const areRowContractDetailsReady = !!pstContractAddress && !!chainId && !!config;

    type ContractTransferDetails = [Address, Address, Address, bigint, bigint, bigint, string];

    // Fetch transfer details within the row component
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

    // Derive values from transferDetails, providing fallbacks for initial loading state
    const sender = transferDetails?.[0];
    const receiver = transferDetails?.[1];
    const tokenAddress = transferDetails?.[2];
    const amount = transferDetails?.[3];
    const creationTime = transferDetails?.[4];
    const cancelationCooldown = transferDetails?.[5];
    const statusFromContract = transferDetails?.[6];

    let statusString: string = "Unknown";
    if (typeof statusFromContract === 'string' &&
        ['Pending', 'Claimed', 'Canceled', 'Expired'].includes(statusFromContract)) {
        statusString = statusFromContract;
    }

    const isNativeToken = tokenAddress?.toLowerCase() === '0x0000000000000000000000000000000000000000';

    // Using useToken hook for ERC20 token details
    const { data: erc20TokenData, isLoading: isErc20TokenLoading, error: erc20TokenError } = useToken({
        address: (!isNativeToken && tokenAddress) ? tokenAddress : undefined,
        chainId: chainId,
        query: {
            enabled: !isNativeToken && !!tokenAddress && !!chainId,
            staleTime: 10_000,
        }
    });

    // Determine the final tokenInfo to display
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


    // Client-side filtering based on `type` prop and current status
    const shouldRender = useMemo(() => {
        // If details are still loading, we can't decide if it should render yet.
        // It will be handled by the specific loading state return below.
        if (isDetailsLoading || !transferDetails) return true; // Assume true during loading, then filter once data is there.

        // Only show "Pending" transfers in this list
        if (statusString !== "Pending") {
            return false;
        }

        if (!userAddress) return false;

        // Apply filtering based on the 'type' prop passed to PendingTransfers
        if (type === "sent") {
            return userAddress.toLowerCase() === sender?.toLowerCase();
        } else if (type === "received") {
            return userAddress.toLowerCase() === receiver?.toLowerCase();
        } else if (type === "all") {
            return true; // Show all pending transfers
        }
        return false;
    }, [type, userAddress, sender, receiver, statusString, isDetailsLoading, transferDetails]);


    // --- CONDITIONAL RENDERING STARTS HERE ---
    // All hooks MUST be called before any conditional returns.

    // Handle initial loading of transfer details
    if (isDetailsLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={10}>Loading transfer details...</td>
            </tr>
        );
    }

    // Handle errors fetching transfer details or invalid data
    if (detailsError || !transferDetails || statusString === "Unknown") {
        console.error("Error fetching transfer details for ID", transferId, detailsError || "Transfer details missing/invalid.");
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={10}>Error loading transfer details.</td>
            </tr>
        );
    }

    // IMPORTANT: Only return null if the row should not be rendered AFTER all hooks are called and
    // initial data fetching for this specific row is done, and the filtering condition is met.
    if (!shouldRender) {
        return null;
    }

    // Now, handle loading/error states for token details, only if the row is actually going to render.
    if (isTokenInfoLoading) {
        return (
            <tr style={tableRowStyle}>
                <td style={tableDataStyle}>{index + 1}</td>
                <td style={tableDataStyle} colSpan={10}>Loading token details...</td>
            </tr>
        );
    }

    if (tokenInfoError || !tokenInfo) {
        console.error("Error fetching token details for", tokenAddress, tokenInfoError);
        return (
            <tr style={tableRowStyle}>
                <td style={{ ...tableDataStyle, color: 'red' }} colSpan={10}>Error fetching token data.</td>
            </tr>
        );
    }

    const displayAmount = (amount && tokenInfo.decimals !== undefined) ? formatUnits(amount, tokenInfo.decimals) : 'N/A';

    // Determine which actions are relevant for this row based on 'type' prop and user address
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
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tokenAddress || '', setCopiedAddress);
                        }}
                        style={copyButtonStyle}
                    >
                        {copiedAddress === tokenAddress ? 'Copied!' : <FontAwesomeIcon icon={faCopy} />}
                    </button>
                </div>
            </td>
            <td style={tableDataStyle}>{displayAmount}</td>
            <td style={tableDataStyle}>{formatTimestamp(creationTime)}</td>
            <td style={tableDataStyle}>{formatTimestamp(cancelationCooldown)}</td>
            <td style={tableDataStyle}>{statusString}</td>
            <td style={tableDataStyle}>
                <div style={tokenDisplayContainerStyle}>
                    <span>{transferId.toString()}</span>
                </div>
            </td>
            {/* Conditional Password Input and Action Buttons */}
            <td style={tableDataStyle}>
                {userAddress && pstContractAddress && chainId ? (
                    <>
                        {showCancelButton && (
                            <CancelTransferButton
                                transferId={transferId}
                                pstContractAddress={pstContractAddress}
                                chainId={chainId}
                                senderAddress={sender || '0x0'}
                                transferStatus={statusString}
                                creationTime={creationTime || 0n}
                                cancelationCooldown={cancelationCooldown || 0n}
                                onCancelActionCompleted={() => onActionSuccess(transferId)}
                            />
                        )}

                        {showClaimButton && (
                            <>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    style={passwordInputStyle}
                                />
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
    pstContractAddress: Address | undefined; // Passed from parent
    refetchTrigger: boolean; // Trigger to force a refetch from parent
    type: "sent" | "received" | "all"; // New prop: "sent", "received", or "all"
    onTransferActionCompleted: (transferId: bigint) => void; // Callback after claim/cancel
}

const PendingTransfers: React.FC<PendingTransfersProps> = ({ pstContractAddress, refetchTrigger, type, onTransferActionCompleted }) => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const config = useConfig();

    const pstContractAddressForChain = useMemo(() => getPSTContractAddress(chain?.id), [chain?.id]);

    const [transferIds, setTransferIds] = useState<bigint[]>([]);
    const [idsFetchError, setIdsFetchError] = useState<Error | null>(null);

    // 1. Fetch ALL transfer IDs associated with the connected user's address OR all system pending transfers
    // The function name changes based on the 'type' prop.
    const getFunctionName = useCallback(() => {
        if (type === "all") {
            return 'getPendingTransfers';
        }
        return 'getAllTransfersByAddress'; // Or 'getPendingTransfersForAddress' if that's what you intend for user-specific pending
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
            staleTime: 5_000, // Reduced stale time for more frequent updates
            refetchOnWindowFocus: false,
            // Select logic to extract the correct array from the contract's return
            select: (data: any) => {
                if (type === "all") {
                    if (!Array.isArray(data)) {
                        console.error("[PendingTransfers:select] Expected array for 'getPendingTransfers', got:", data);
                        throw new Error("Invalid data format from getPendingTransfers");
                    }
                    return data as bigint[];
                }
                // For 'sent' or 'received' (via 'getAllTransfersByAddress'), we get a tuple.
                // We want the first element of the tuple, which is the 'pending' array.
                if (!Array.isArray(data) || data.length < 1 || !Array.isArray(data[0])) {
                    console.error("[PendingTransfers:select] Expected array of arrays for 'getAllTransfersByAddress', got:", data);
                    throw new Error("Invalid data format from getAllTransfersByAddress");
                }
                return data[0] as bigint[]; // Return the 'pending' transfers array from the tuple
            }
        },
    });

    useEffect(() => {
        if (fetchIdsError) {
            console.error("[PendingTransfers] Error fetching transfer IDs from contract:", fetchIdsError);
            setIdsFetchError(fetchIdsError);
            setTransferIds([]); // Clear IDs on error
        } else if (fetchedIdsData !== undefined) {
            console.log("[PendingTransfers] fetchedIdsData updated:", fetchedIdsData);
            setTransferIds(fetchedIdsData);
            setIdsFetchError(null);
        }
    }, [fetchedIdsData, fetchIdsError]);

    // Effect to trigger refetch when refetchTrigger changes (from parent) or user/chain/type changes
    useEffect(() => {
        console.log("[PendingTransfers] refetch useEffect triggered. Current state:", { refetchTrigger, userAddress, isConnected, pstContractAddressForChain, type });
        if (isConnected && userAddress && pstContractAddressForChain) {
            console.log("[PendingTransfers] Calling refetchIds()");
            refetchIds();
        } else {
            console.log("[PendingTransfers] Skipping refetchIds - not connected or missing info.");
        }
    }, [refetchTrigger, userAddress, isConnected, pstContractAddressForChain, refetchIds, type]);

    // Callback for child components (Cancel/Claim Button) to trigger a refetch
    const handleActionCompleted = useCallback((transferId: bigint) => {
        console.log(`[PendingTransfers] handleActionCompleted called for ID: ${transferId}. Notifying parent and initiating refetch.`);
        onTransferActionCompleted(transferId); // Notify parent
        // Instead of immediate refetch, let's rely on the parent's refetchTrigger or a direct refetch
        // if this component needs to update itself independently quickly.
        // For now, onActionSuccess from button will trigger parent's onTransferActionCompleted,
        // which then toggles the refetchTrigger for THIS component.
    }, [onTransferActionCompleted]);

    // Sort the transfer IDs before mapping to ensure stable order
    const sortedTransferIds = useMemo(() => {
        // Filter out 0n IDs if your contract can return them as placeholders
        const validIds = transferIds.filter(id => id !== 0n);
        console.log("[PendingTransfers] Sorted transfer IDs after filter:", validIds);
        return [...validIds].sort((a, b) => {
            // Sort in ascending order of ID, or adjust based on your preference (e.g., newest first)
            if (a > b) return -1;
            if (a < b) return 1;
            return 0;
        });
    }, [transferIds]);


    const titleText = useMemo(() => {
        switch (type) {
            case "sent": return "Your Sent Pending Transfers";
            case "received": return "";
            case "all": return "All System Pending Transfers";
            default: return "Pending Transfers";
        }
    }, [type]);


    if (!isConnected || !userAddress) {
        return (
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{titleText}</h2>
                <p style={disconnectedNetworkStyle}>Connect your wallet to see pending transfers.</p>
            </div>
        );
    }

    if (isLoadingIds) {
        return (
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{titleText}</h2>
                <p style={{ textAlign: 'center', color: '#ccc' }}>Loading transfer IDs...</p>
            </div>
        );
    }

    if (idsFetchError) {
        return (
            <div style={pendingTransfersContainerStyle}>
                <h2 style={pendingTransfersTitleStyle}>{titleText}</h2>
                <p style={{ textAlign: 'center', color: 'red' }}>Error loading transfers: {idsFetchError.message}</p>
            </div>
        );
    }

    const hasTransfersToRender = sortedTransferIds.length > 0;

    return (
        <div style={pendingTransfersContainerStyle}>
            <h2 style={pendingTransfersTitleStyle}>{titleText}</h2>
            {!hasTransfersToRender ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>No pending transfers found.</p>
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
                                <th style={tableHeaderStyle}>Action</th> {/* This column now includes password input and buttons */}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Map over sorted IDs and let each row fetch its own details and filter */}
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
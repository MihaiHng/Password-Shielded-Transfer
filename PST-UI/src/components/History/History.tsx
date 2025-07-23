// // // src/components/HistoryTransfers.tsx

// // import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'; // Added useRef
// // import { useAccount, useReadContract, useReadContracts } from 'wagmi';
// // import { useQueryClient } from '@tanstack/react-query';
// // import { Address, formatUnits } from 'viem';
// // import type { Abi } from 'viem';

// // // Import Font Awesome icons
// // import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// // import { faCopy, faSyncAlt } from '@fortawesome/free-solid-svg-icons'; // Added faSyncAlt for refresh button

// // // Import ABIs
// // import abiPstWrapper from '../lib/abis/abi_pst.json';
// // import erc20AbiJson from '../lib/abis/abi_erc20.json';

// // // Import pre-approved tokens list (needed for token decimals lookup)
// // import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList';

// // // Import React's CSSProperties type
// // import type { CSSProperties } from 'react';

// // // Type assertions for ABIs
// // const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
// // const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

// // // Define your contract address for the PSTWrapper (this will vary by network)
// // const PST_CONTRACT_ADDRESS_SEPOLIA = import.meta.env.VITE_PST_ETH_SEPOLIA_ADDRESS as `0x${string}`;
// // const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA = import.meta.env.VITE_PST_ZKSYNC_SEPOLIA_ADDRESS as `0x${string}`;

// // const getPSTContractAddress = (chainId: number | undefined): Address | undefined => {
// //     switch (chainId) {
// //         case 11155111: return PST_CONTRACT_ADDRESS_SEPOLIA;
// //         case 300: return PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA;
// //         default: return undefined;
// //     }
// // };

// // // --- STYLES FOR HISTORY TRANSFERS SECTION ---
// // const historyTransfersContainerStyle: CSSProperties = {
// //     background: '#1b1b1b',
// //     borderRadius: '20px',
// //     padding: '24px',
// //     maxWidth: '1000px',
// //     margin: '40px auto',
// //     boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
// //     backdropFilter: 'blur(4px)',
// //     border: '1px solid rgba(255, 255, 255, 0.18)',
// //     color: '#fff',
// //     fontFamily: 'Inter, sans-serif',
// //     position: 'relative', // Added for positioning refresh button
// // };

// // const copiedPopupStyle: React.CSSProperties = {
// //     position: 'fixed',
// //     top: '20px',
// //     left: '20px',
// //     transform: 'none',
// //     backgroundColor: '#E0E0E0',
// //     color: '#333',
// //     padding: '12px 24px',
// //     borderRadius: '8px',
// //     fontSize: '14px',
// //     fontWeight: 'bold',
// //     zIndex: 10000,
// //     boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
// //     textAlign: 'center',
// //     opacity: 0,
// //     visibility: 'hidden',
// //     transition: 'opacity 0.3s ease, visibility 0.3s ease',
// // };

// // const historyTransfersTitleStyle: CSSProperties = {
// //     fontSize: '24px',
// //     fontWeight: 'bold',
// //     marginBottom: '20px',
// //     textAlign: 'center',
// //     color: '#fff',
// // };

// // const tableContainerStyle: CSSProperties = {
// //     border: '1px solid rgba(255, 255, 255, 0.1)',
// //     borderRadius: '12px',
// //     overflowX: 'auto',
// // };

// // const tableStyle: CSSProperties = {
// //     width: '100%',
// //     borderCollapse: 'separate',
// //     borderSpacing: '0',
// //     backgroundColor: '#2c2c2c',
// //     borderRadius: '12px',
// // };

// // const tableHeaderStyle: CSSProperties = {
// //     backgroundColor: '#3a3a3a',
// //     color: '#fff',
// //     fontSize: '14px',
// //     fontWeight: 'bold',
// //     padding: '12px 15px',
// //     textAlign: 'center',
// //     position: 'sticky',
// //     top: 0,
// //     zIndex: 1,
// // };

// // const tableRowStyle: CSSProperties = {
// //     borderBottom: '1px solid #3a3a3a',
// // };

// // const tableDataStyle: CSSProperties = {
// //     padding: '12px 15px',
// //     fontSize: '14px',
// //     color: '#eee',
// //     verticalAlign: 'middle',
// // };

// // const tokenDisplayContainerStyle: CSSProperties = {
// //     display: 'flex',
// //     alignItems: 'center',
// //     gap: '1px',
// // };

// // const copyButtonStyle: CSSProperties = {
// //     background: 'transparent',
// //     border: 'none',
// //     color: '#fff',
// //     cursor: 'pointer',
// //     fontSize: '14px',
// //     padding: '4px',
// //     borderRadius: '4px',
// //     marginLeft: '4px',
// //     display: 'flex',
// //     alignItems: 'center',
// //     justifyContent: 'center',
// //     transition: 'background-color 0.2s ease',
// //     outline: 'none',
// //     boxShadow: 'none',
// // };

// // const disconnectedNetworkStyle: CSSProperties = {
// //     fontSize: '14px',
// //     color: 'red',
// //     textAlign: 'center',
// //     marginBottom: '20px',
// // };

// // const refreshButtonStyle: CSSProperties = {
// //     position: 'absolute',
// //     top: '24px',
// //     right: '24px',
// //     background: 'none',
// //     border: 'none',
// //     color: '#fff',
// //     fontSize: '18px',
// //     cursor: 'pointer',
// //     padding: '8px',
// //     borderRadius: '8px',
// //     transition: 'background-color 0.2s ease, transform 0.2s ease',
// //     display: 'flex',
// //     alignItems: 'center',
// //     justifyContent: 'center',
// //     zIndex: 10,
// // };


// // // --- UTILITY FUNCTIONS ---
// // const truncateAddress = (address: string): string => {
// //     if (!address || address.length < 10) return address;
// //     return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
// // };

// // const copyToClipboard = async (text: string, setShowPopup: React.Dispatch<React.SetStateAction<boolean>>) => {
// //     try {
// //         await navigator.clipboard.writeText(text);
// //         setShowPopup(true);
// //         setTimeout(() => {
// //             setShowPopup(false);
// //         }, 1500);
// //     } catch (err) {
// //         console.error('Failed to copy text: ', err);
// //         // You might want a more user-friendly error display here
// //     }
// // };

// // const formatTimestamp = (timestamp: bigint | undefined): string => {
// //     if (timestamp === undefined || timestamp === 0n) return 'N/A';
// //     const date = new Date(Number(timestamp) * 1000);
// //     return date.toLocaleString();
// // };

// // interface TokenInfo {
// //     address: Address;
// //     symbol: string;
// //     decimals: number;
// //     name: string;
// //     logoURI?: string;
// //     isNative?: boolean;
// // }

// // // --- HISTORY TRANSFER ROW COMPONENT ---
// // interface HistoryTransferRowProps {
// //     index: number;
// //     transferId: bigint;
// //     sender: Address;
// //     receiver: Address;
// //     tokenAddress: Address;
// //     amount: bigint;
// //     creationTime: bigint;
// //     expiringTime: bigint;
// //     status: string;
// //     userAddress: Address | undefined;
// //     tokenSymbol: string;
// //     tokenDecimals: number;
// //     setShowCopiedPopup: React.Dispatch<React.SetStateAction<boolean>>;
// // }

// // const HistoryTransferRow: React.FC<HistoryTransferRowProps> = ({
// //     index,
// //     transferId,
// //     sender,
// //     receiver,
// //     tokenAddress,
// //     amount,
// //     creationTime,
// //     expiringTime,
// //     status,
// //     userAddress,
// //     tokenSymbol,
// //     tokenDecimals,
// //     setShowCopiedPopup,
// // }) => {
// //     const [isHovered, setIsHovered] = useState(false);

// //     const displayAmount = formatUnits(amount, tokenDecimals);

// //     return (
// //         <tr style={tableRowStyle}>
// //             <td style={tableDataStyle}>{index + 1}</td>
// //             <td style={tableDataStyle}>
// //                 {userAddress?.toLowerCase() === sender.toLowerCase() ? "You" : truncateAddress(sender)}
// //             </td>
// //             <td style={tableDataStyle}>
// //                 {userAddress?.toLowerCase() === receiver.toLowerCase() ? "You" : truncateAddress(receiver)}
// //             </td>
// //             <td style={tableDataStyle}>
// //                 <div style={tokenDisplayContainerStyle}>
// //                     <span>{tokenSymbol || 'N/A'}</span>
// //                     <button
// //                         onClick={(e) => {
// //                             e.stopPropagation();
// //                             copyToClipboard(tokenAddress, setShowCopiedPopup);
// //                         }}
// //                         onMouseEnter={() => setIsHovered(true)}
// //                         onMouseLeave={() => setIsHovered(false)}
// //                         style={{
// //                             ...copyButtonStyle,
// //                             backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
// //                         }}
// //                     >
// //                         <FontAwesomeIcon icon={faCopy} />
// //                     </button>
// //                 </div>
// //             </td>
// //             <td style={tableDataStyle}>{displayAmount}</td>
// //             <td style={tableDataStyle}>{formatTimestamp(creationTime)}</td>
// //             <td style={tableDataStyle}>{formatTimestamp(expiringTime)}</td>
// //             <td style={tableDataStyle}>{status}</td>
// //             <td style={tableDataStyle}>
// //                 <div style={tokenDisplayContainerStyle}>
// //                     <span>{transferId.toString()}</span>
// //                 </div>
// //             </td>
// //         </tr>
// //     );
// // };

// // interface HistoryTransfersProps {
// //     componentTitle?: string;
// //     refetchTrigger?: boolean; // Prop from parent to force refetch
// // }

// // const HistoryTransfers: React.FC<HistoryTransfersProps> = ({ componentTitle, refetchTrigger }): React.ReactElement | null => {
// //     const { address: userAddress, chain, isConnected } = useAccount();
// //     const queryClient = useQueryClient();

// //     const pstContractAddress = getPSTContractAddress(chain?.id);

// //     const [showLocalCopiedPopup, setShowLocalCopiedPopup] = useState<boolean>(false);
// //     const [isRefreshing, setIsRefreshing] = useState<boolean>(false); // State for refresh button animation/feedback

// //     // Ref for the debounce timeout
// //     const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// //     // Function to handle manual refresh
// //     const handleManualRefresh = useCallback(() => {
// //         setIsRefreshing(true); // Start spinning icon

// //         // Clear any existing debounce timeout
// //         if (debounceTimeoutRef.current) {
// //             clearTimeout(debounceTimeoutRef.current);
// //         }

// //         // Set a new timeout to invalidate queries
// //         debounceTimeoutRef.current = setTimeout(() => {
// //             queryClient.invalidateQueries({
// //                 queryKey: ['getAllTransfersByAddress', userAddress, chain?.id, pstContractAddress],
// //             });
// //             queryClient.invalidateQueries({
// //                 queryKey: ['contracts'],
// //                 refetchType: 'active'
// //             });
// //             // Stop spinning after a short delay, assuming queries start fetching immediately
// //             // A more robust solution would check `isFetching` from react-query hooks
// //             setTimeout(() => setIsRefreshing(false), 1000); // Stop after 1 second for visual feedback
// //         }, 300); // Debounce refresh calls by 300ms
// //     }, [queryClient, userAddress, chain?.id, pstContractAddress]);


// //     // 1. Get all transfer IDs associated with the user
// //     const {
// //         data: allTransferIdsQueryResult,
// //         isLoading: isLoadingAllTransferIds,
// //         error: allTransferIdsError,
// //     } = useReadContract({
// //         address: pstContractAddress,
// //         abi: PST_CONTRACT_ABI,
// //         functionName: 'getAllTransfersByAddress',
// //         args: userAddress ? [userAddress] : undefined,
// //         chainId: chain?.id,
// //         query: {
// //             enabled: !!userAddress && !!pstContractAddress && isConnected,
// //             staleTime: 1000 * 60 * 1, // Increase staleTime to 1 minute
// //             gcTime: 1000 * 60 * 10, // Keep cached for 10 minutes
// //         }
// //     }) as { data?: [bigint[], bigint[], bigint[], bigint[]], isLoading: boolean, error: Error | null };


// //     const allUniqueTransferIds = useMemo(() => {
// //         if (!allTransferIdsQueryResult) return [];
// //         return Array.from(new Set([
// //             ...(allTransferIdsQueryResult[0] || []),
// //             ...(allTransferIdsQueryResult[1] || []),
// //             ...(allTransferIdsQueryResult[2] || []),
// //             ...(allTransferIdsQueryResult[3] || []),
// //         ]));
// //     }, [allTransferIdsQueryResult]);


// //     // 2. Batch fetch transfer details and original amounts for all unique IDs
// //     const {
// //         data: transferDetailsAndAmountsData,
// //         isLoading: isLoadingDetailsAndAmounts,
// //         isError: hasErrorDetailsAndAmounts,
// //         error: detailsAndAmountsBatchError
// //     } = useReadContracts({
// //         contracts: allUniqueTransferIds.map((transferId) => ([
// //             {
// //                 address: pstContractAddress,
// //                 abi: PST_CONTRACT_ABI,
// //                 functionName: 'getTransferDetails',
// //                 args: [transferId],
// //                 chainId: chain?.id,
// //             },
// //             {
// //                 address: pstContractAddress,
// //                 abi: PST_CONTRACT_ABI,
// //                 functionName: 's_originalAmounts',
// //                 args: [transferId],
// //                 chainId: chain?.id,
// //             },
// //         ])).flat(),
// //         query: {
// //             enabled: allUniqueTransferIds.length > 0 && !!pstContractAddress && !!chain?.id,
// //             staleTime: 1000 * 60 * 2, // Increase staleTime to 2 minutes
// //             gcTime: 1000 * 60 * 10, // Keep cached for 10 minutes
// //         }
// //     });


// //     // 3. Extract unique token addresses and prepare queries for their symbols/decimals
// //     const uniqueTokenAddresses = useMemo(() => {
// //         const addresses = new Set<Address>();
// //         if (transferDetailsAndAmountsData) {
// //             for (let i = 0; i < transferDetailsAndAmountsData.length; i += 2) {
// //                 const detailsResult = transferDetailsAndAmountsData[i];
// //                 if (detailsResult.status === 'success' && detailsResult.result) {
// //                     const tokenAddress = (detailsResult.result as any[])[2] as Address;
// //                     if (tokenAddress !== '0x0000000000000000000000000000000000000000') {
// //                         const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id);
// //                         if (!networkConfig?.tokens.some(t => t.address.toLowerCase() === tokenAddress.toLowerCase())) {
// //                             addresses.add(tokenAddress);
// //                         }
// //                     }
// //                 }
// //             }
// //         }
// //         return Array.from(addresses);
// //     }, [transferDetailsAndAmountsData, chain?.id]);


// //     const {
// //         data: tokenInfoData,
// //         isLoading: isLoadingTokenInfo,
// //         isError: hasErrorTokenInfo,
// //         error: tokenInfoBatchError
// //     } = useReadContracts({
// //         contracts: uniqueTokenAddresses.flatMap((tokenAddress) => [
// //             {
// //                 address: tokenAddress,
// //                 abi: ERC20_CONTRACT_ABI,
// //                 functionName: 'symbol',
// //                 chainId: chain?.id,
// //             },
// //             {
// //                 address: tokenAddress,
// //                 abi: ERC20_CONTRACT_ABI,
// //                 functionName: 'decimals',
// //                 chainId: chain?.id,
// //             },
// //         ]),
// //         query: {
// //             enabled: uniqueTokenAddresses.length > 0 && !!chain?.id,
// //             staleTime: Infinity,
// //             gcTime: 1000 * 60 * 60 * 24,
// //         }
// //     });


// //     // 4. Consolidate all data into a single historyTransfers array for rendering
// //     const historyTransfers = useMemo(() => {
// //         if (isLoadingAllTransferIds || isLoadingDetailsAndAmounts || isLoadingTokenInfo) return [];
// //         if (allTransferIdsError || hasErrorDetailsAndAmounts || hasErrorTokenInfo) return [];

// //         const processedTransfers: {
// //             transferId: bigint;
// //             sender: Address;
// //             receiver: Address;
// //             tokenAddress: Address;
// //             amount: bigint;
// //             creationTime: bigint;
// //             expiringTime: bigint;
// //             status: string;
// //             tokenSymbol: string;
// //             tokenDecimals: number;
// //         }[] = [];

// //         const fetchedTokenMap = new Map<Address, { symbol: string; decimals: number }>();
// //         uniqueTokenAddresses.forEach((address, idx) => {
// //             const symbolResult = tokenInfoData?.[idx * 2];
// //             const decimalsResult = tokenInfoData?.[idx * 2 + 1];
// //             if (symbolResult?.status === 'success' && symbolResult.result && decimalsResult?.status === 'success' && decimalsResult.result !== undefined) {
// //                 fetchedTokenMap.set(address, {
// //                     symbol: symbolResult.result as string,
// //                     decimals: decimalsResult.result as number,
// //                 });
// //             }
// //         });

// //         allUniqueTransferIds.forEach((transferId, index) => {
// //             const detailsResult = transferDetailsAndAmountsData?.[index * 2];
// //             const amountResult = transferDetailsAndAmountsData?.[index * 2 + 1];

// //             if (detailsResult?.status === 'success' && detailsResult.result &&
// //                 amountResult?.status === 'success' && amountResult.result !== undefined) {

// //                 const details = detailsResult.result as [Address, Address, Address, bigint, bigint, bigint, string];
// //                 const originalAmount = amountResult.result as bigint;

// //                 const [sender, receiver, tokenAddress, , creationTime, expiringTime, status] = details;

// //                 const isRelatedToCurrentUser =
// //                     userAddress?.toLowerCase() === sender.toLowerCase() ||
// //                     userAddress?.toLowerCase() === receiver.toLowerCase();

// //                 if (status === "Pending" || !isRelatedToCurrentUser) {
// //                     return;
// //                 }

// //                 let tokenSymbol: string | undefined;
// //                 let tokenDecimals: number | undefined;

// //                 if (tokenAddress === '0x0000000000000000000000000000000000000000') {
// //                     tokenSymbol = 'ETH';
// //                     tokenDecimals = 18;
// //                 } else {
// //                     const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id);
// //                     const localToken = networkConfig?.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) as TokenInfo | undefined;
// //                     if (localToken) {
// //                         tokenSymbol = localToken.symbol;
// //                         tokenDecimals = localToken.decimals;
// //                     } else {
// //                         const fetched = fetchedTokenMap.get(tokenAddress);
// //                         if (fetched) {
// //                             tokenSymbol = fetched.symbol;
// //                             tokenDecimals = fetched.decimals;
// //                         } else {
// //                             tokenSymbol = 'Unknown';
// //                             tokenDecimals = 0;
// //                         }
// //                     }
// //                 }

// //                 processedTransfers.push({
// //                     transferId,
// //                     sender,
// //                     receiver,
// //                     tokenAddress,
// //                     amount: originalAmount,
// //                     creationTime,
// //                     expiringTime,
// //                     status,
// //                     tokenSymbol: tokenSymbol || 'Unknown',
// //                     tokenDecimals: tokenDecimals || 0,
// //                 });
// //             }
// //         });

// //         return processedTransfers.sort((a, b) => {
// //             if (a.creationTime > b.creationTime) return -1;
// //             if (a.creationTime < b.creationTime) return 1;
// //             return 0;
// //         });

// //     }, [
// //         allUniqueTransferIds,
// //         transferDetailsAndAmountsData,
// //         tokenInfoData,
// //         chain?.id,
// //         userAddress,
// //         isLoadingAllTransferIds,
// //         isLoadingDetailsAndAmounts,
// //         isLoadingTokenInfo,
// //         allTransferIdsError,
// //         hasErrorDetailsAndAmounts,
// //         hasErrorTokenInfo
// //     ]);


// //     // Effect to trigger refetch when refetchTrigger prop changes (from parent)
// //     useEffect(() => {
// //         if (refetchTrigger) {
// //             handleManualRefresh(); // Use the debounced handler
// //         }
// //     }, [refetchTrigger, handleManualRefresh]); // Depend on handleManualRefresh


// //     // Cleanup the debounce timeout when the component unmounts
// //     useEffect(() => {
// //         return () => {
// //             if (debounceTimeoutRef.current) {
// //                 clearTimeout(debounceTimeoutRef.current);
// //             }
// //         };
// //     }, []);


// //     const displayedTitle = useMemo(() => {
// //         return componentTitle || "Your Transfer History";
// //     }, [componentTitle]);

// //     const overallIsLoading = isLoadingAllTransferIds || isLoadingDetailsAndAmounts || isLoadingTokenInfo;
// //     const overallHasError = allTransferIdsError || detailsAndAmountsBatchError || tokenInfoBatchError;

// //     let displayErrorMessage: string | null = null;
// //     if (allTransferIdsError) {
// //         displayErrorMessage = allTransferIdsError.message;
// //     } else if (detailsAndAmountsBatchError) {
// //         displayErrorMessage = detailsAndAmountsBatchError.message || "One or more transfer details or amounts failed to load.";
// //     } else if (tokenInfoBatchError) {
// //         displayErrorMessage = tokenInfoBatchError.message || "One or more token details failed to load.";
// //     }

// //     return (
// //         <>
// //             <div style={historyTransfersContainerStyle}>
// //                 <h2 style={historyTransfersTitleStyle}>{displayedTitle}</h2>
// //                 {isConnected && userAddress && (
// //                     <button
// //                         onClick={handleManualRefresh}
// //                         style={{
// //                             ...refreshButtonStyle,
// //                             cursor: overallIsLoading ? 'not-allowed' : 'pointer',
// //                         }}
// //                         disabled={overallIsLoading} // Disable button while loading
// //                     >
// //                         <FontAwesomeIcon
// //                             icon={faSyncAlt}
// //                             spin={isRefreshing} // Spin icon when refreshing
// //                             style={{ marginRight: '5px' }}
// //                         />
// //                         Refresh
// //                     </button>
// //                 )}

// //                 {!isConnected || !userAddress ? (
// //                     <p style={disconnectedNetworkStyle}>Connect your wallet to see your transfer history.</p>
// //                 ) : overallIsLoading ? (
// //                     <p style={{ textAlign: 'center', color: '#ccc' }}>Loading transfer history...</p>
// //                 ) : displayErrorMessage ? (
// //                     <p style={{ textAlign: 'center', color: 'red' }}>Error loading history: {displayErrorMessage}</p>
// //                 ) : historyTransfers.length === 0 ? (
// //                     <p style={{ textAlign: 'center', color: '#ccc' }}>No transfer history found for your address.</p>
// //                 ) : (
// //                     <div style={tableContainerStyle}>
// //                         <table style={tableStyle}>
// //                             <thead>
// //                                 <tr>
// //                                     <th style={tableHeaderStyle}>Index</th>
// //                                     <th style={tableHeaderStyle}>Sender</th>
// //                                     <th style={tableHeaderStyle}>Receiver</th>
// //                                     <th style={tableHeaderStyle}>Token</th>
// //                                     <th style={tableHeaderStyle}>Amount</th>
// //                                     <th style={tableHeaderStyle}>Creation Time</th>
// //                                     <th style={tableHeaderStyle}>Expiration Time</th>
// //                                     <th style={tableHeaderStyle}>Status</th>
// //                                     <th style={tableHeaderStyle}>ID</th>
// //                                 </tr>
// //                             </thead>
// //                             <tbody>
// //                                 {historyTransfers.map((item, index) => (
// //                                     <HistoryTransferRow
// //                                         key={item.transferId.toString()}
// //                                         index={index}
// //                                         transferId={item.transferId}
// //                                         sender={item.sender}
// //                                         receiver={item.receiver}
// //                                         tokenAddress={item.tokenAddress}
// //                                         amount={item.amount}
// //                                         creationTime={item.creationTime}
// //                                         expiringTime={item.expiringTime}
// //                                         status={item.status}
// //                                         userAddress={userAddress}
// //                                         tokenSymbol={item.tokenSymbol}
// //                                         tokenDecimals={item.tokenDecimals}
// //                                         setShowCopiedPopup={setShowLocalCopiedPopup}
// //                                     />
// //                                 ))}
// //                             </tbody>
// //                         </table>
// //                     </div>
// //                 )}
// //             </div>

// //             <div style={{
// //                 ...copiedPopupStyle,
// //                 opacity: showLocalCopiedPopup ? 1 : 0,
// //                 visibility: showLocalCopiedPopup ? 'visible' : 'hidden',
// //             }}>
// //                 Address Copied!
// //             </div>
// //         </>
// //     );
// // };

// // export default HistoryTransfers;



// // src/components/HistoryTransfers.tsx

// import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// import { useAccount, useReadContract, useReadContracts } from 'wagmi';
// import { useQueryClient } from '@tanstack/react-query';
// import { Address, formatUnits } from 'viem';
// import type { Abi } from 'viem';

// // Import Font Awesome icons
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// import { faCopy, faSyncAlt } from '@fortawesome/free-solid-svg-icons';

// // Import ABIs
// import abiPstWrapper from '../../lib/abis/abi_pst.json';
// import erc20AbiJson from '../../lib/abis/abi_erc20.json';

// // Import pre-approved tokens list (needed for token decimals lookup)
// import { ALL_NETWORK_TOKENS } from '../../lib/constants/tokenList';

// // Import React's CSSProperties type
// import type { CSSProperties } from 'react';

// // Type assertions for ABIs
// const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
// const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

// // Define your contract address for the PSTWrapper (this will vary by network)
// const PST_CONTRACT_ADDRESS_SEPOLIA = import.meta.env.VITE_PST_ETH_SEPOLIA_ADDRESS as `0x${string}`;
// const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA = import.meta.env.VITE_PST_ZKSYNC_SEPOLIA_ADDRESS as `0x${string}`;

// const getPSTContractAddress = (chainId: number | undefined): Address | undefined => {
//     switch (chainId) {
//         case 11155111: return PST_CONTRACT_ADDRESS_SEPOLIA;
//         case 300: return PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA;
//         default: return undefined;
//     }
// };

// // --- STYLES FOR HISTORY TRANSFERS SECTION ---
// const historyTransfersContainerStyle: CSSProperties = {
//     background: '#1b1b1b',
//     borderRadius: '20px',
//     padding: '24px',
//     maxWidth: '1000px',
//     margin: '40px auto',
//     boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
//     backdropFilter: 'blur(4px)',
//     border: '1px solid rgba(255, 255, 255, 0.18)',
//     color: '#fff',
//     fontFamily: 'Inter, sans-serif',
//     position: 'relative',
// };

// const copiedPopupStyle: React.CSSProperties = {
//     position: 'fixed',
//     top: '20px',
//     left: '20px',
//     transform: 'none',
//     backgroundColor: '#E0E0E0',
//     color: '#333',
//     padding: '12px 24px',
//     borderRadius: '8px',
//     fontSize: '14px',
//     fontWeight: 'bold',
//     zIndex: 10000,
//     boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
//     textAlign: 'center',
//     opacity: 0,
//     visibility: 'hidden',
//     transition: 'opacity 0.3s ease, visibility 0.3s ease',
// };

// const historyTransfersTitleStyle: CSSProperties = {
//     fontSize: '24px',
//     fontWeight: 'bold',
//     marginBottom: '20px',
//     textAlign: 'center',
//     color: '#fff',
// };

// const tableContainerStyle: CSSProperties = {
//     border: '1px solid rgba(255, 255, 255, 0.1)',
//     borderRadius: '12px',
//     overflowX: 'auto',
// };

// const tableStyle: CSSProperties = {
//     width: '100%',
//     borderCollapse: 'separate',
//     borderSpacing: '0',
//     backgroundColor: '#2c2c2c',
//     borderRadius: '12px',
// };

// const tableHeaderStyle: CSSProperties = {
//     backgroundColor: '#3a3a3a',
//     color: '#fff',
//     fontSize: '14px',
//     fontWeight: 'bold',
//     padding: '12px 15px',
//     textAlign: 'center',
//     position: 'sticky',
//     top: 0,
//     zIndex: 1,
// };

// const tableRowStyle: CSSProperties = {
//     borderBottom: '1px solid #3a3a3a',
// };

// const tableDataStyle: CSSProperties = {
//     padding: '12px 15px',
//     fontSize: '14px',
//     color: '#eee',
//     verticalAlign: 'middle',
// };

// const tokenDisplayContainerStyle: CSSProperties = {
//     display: 'flex',
//     alignItems: 'center',
//     gap: '1px',
// };

// const copyButtonStyle: CSSProperties = {
//     background: 'transparent',
//     border: 'none',
//     color: '#fff',
//     cursor: 'pointer',
//     fontSize: '14px',
//     padding: '4px',
//     borderRadius: '4px',
//     marginLeft: '4px',
//     display: 'flex',
//     alignItems: 'center',
//     justifyContent: 'center',
//     transition: 'background-color 0.2s ease, transform 0.2s ease',
//     outline: 'none',
//     boxShadow: 'none',
// };

// const disconnectedNetworkStyle: CSSProperties = {
//     fontSize: '14px',
//     color: 'red',
//     textAlign: 'center',
//     marginBottom: '20px',
// };

// const refreshButtonStyle: CSSProperties = {
//     position: 'absolute',
//     top: '24px',
//     right: '24px',
//     background: 'none',
//     border: 'none',
//     color: '#fff',
//     fontSize: '18px',
//     cursor: 'pointer',
//     padding: '8px',
//     borderRadius: '8px',
//     transition: 'background-color 0.2s ease, transform 0.2s ease',
//     display: 'flex',
//     alignItems: 'center',
//     justifyContent: 'center',
//     zIndex: 10,
//     backgroundColor: 'rgba(255, 255, 255, 0.1)', // Subtle background
// };

// const paginationContainerStyle: CSSProperties = {
//     display: 'flex',
//     justifyContent: 'center',
//     alignItems: 'center',
//     gap: '15px',
//     marginTop: '20px',
// };

// const paginationButtonStyle: CSSProperties = {
//     background: '#2196F3',
//     color: '#fff',
//     border: 'none',
//     borderRadius: '8px',
//     padding: '10px 20px',
//     cursor: 'pointer',
//     fontSize: '16px',
//     fontWeight: 'bold',
//     transition: 'background-color 0.3s ease',
// };


// // --- UTILITY FUNCTIONS ---
// const truncateAddress = (address: string): string => {
//     if (!address || address.length < 10) return address;
//     return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
// };

// const copyToClipboard = async (text: string, setShowPopup: React.Dispatch<React.SetStateAction<boolean>>) => {
//     try {
//         await navigator.clipboard.writeText(text);
//         setShowPopup(true);
//         setTimeout(() => {
//             setShowPopup(false);
//         }, 1500);
//     } catch (err) {
//         console.error('Failed to copy text: ', err);
//     }
// };

// const formatTimestamp = (timestamp: bigint | undefined): string => {
//     if (timestamp === undefined || timestamp === 0n) return 'N/A';
//     const date = new Date(Number(timestamp) * 1000);
//     return date.toLocaleString();
// };

// interface TokenInfo {
//     address: Address;
//     symbol: string;
//     decimals: number;
//     name: string;
//     logoURI?: string;
//     isNative?: boolean;
// }

// // --- HISTORY TRANSFER ROW COMPONENT ---
// interface HistoryTransferRowProps {
//     index: number;
//     transferId: bigint;
//     sender: Address;
//     receiver: Address;
//     tokenAddress: Address;
//     amount: bigint;
//     creationTime: bigint;
//     expiringTime: bigint;
//     status: string;
//     userAddress: Address | undefined;
//     tokenSymbol: string;
//     tokenDecimals: number;
//     setShowCopiedPopup: React.Dispatch<React.SetStateAction<boolean>>;
// }

// const HistoryTransferRow: React.FC<HistoryTransferRowProps> = ({
//     index,
//     transferId,
//     sender,
//     receiver,
//     tokenAddress,
//     amount,
//     creationTime,
//     expiringTime,
//     status,
//     userAddress,
//     tokenSymbol,
//     tokenDecimals,
//     setShowCopiedPopup,
// }) => {
//     const [isHovered, setIsHovered] = useState(false);

//     const displayAmount = formatUnits(amount, tokenDecimals);

//     return (
//         <tr style={tableRowStyle}>
//             <td style={tableDataStyle}>{index + 1}</td>
//             <td style={tableDataStyle}>
//                 {userAddress?.toLowerCase() === sender.toLowerCase() ? "You" : truncateAddress(sender)}
//             </td>
//             <td style={tableDataStyle}>
//                 {userAddress?.toLowerCase() === receiver.toLowerCase() ? "You" : truncateAddress(receiver)}
//             </td>
//             <td style={tableDataStyle}>
//                 <div style={tokenDisplayContainerStyle}>
//                     <span>{tokenSymbol || 'N/A'}</span>
//                     <button
//                         onClick={(e) => {
//                             e.stopPropagation();
//                             copyToClipboard(tokenAddress, setShowCopiedPopup);
//                         }}
//                         onMouseEnter={() => setIsHovered(true)}
//                         onMouseLeave={() => setIsHovered(false)}
//                         style={{
//                             ...copyButtonStyle,
//                             backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
//                         }}
//                     >
//                         <FontAwesomeIcon icon={faCopy} />
//                     </button>
//                 </div>
//             </td>
//             <td style={tableDataStyle}>{displayAmount}</td>
//             <td style={tableDataStyle}>{formatTimestamp(creationTime)}</td>
//             <td style={tableDataStyle}>{formatTimestamp(expiringTime)}</td>
//             <td style={tableDataStyle}>{status}</td>
//             <td style={tableDataStyle}>
//                 <div style={tokenDisplayContainerStyle}>
//                     <span>{transferId.toString()}</span>
//                 </div>
//             </td>
//         </tr>
//     );
// };

// interface HistoryTransfersProps {
//     componentTitle?: string;
//     refetchTrigger?: boolean; // Prop from parent to force refetch
// }

// const ITEMS_PER_PAGE = 10; // Define how many transfers per page

// const HistoryTransfers: React.FC<HistoryTransfersProps> = ({ componentTitle, refetchTrigger }): React.ReactElement | null => {
//     const { address: userAddress, chain, isConnected } = useAccount();
//     const queryClient = useQueryClient();

//     const pstContractAddress = getPSTContractAddress(chain?.id);

//     const [showLocalCopiedPopup, setShowLocalCopiedPopup] = useState<boolean>(false);
//     const [currentPage, setCurrentPage] = useState(0); // State for current page (0-indexed)
//     const [totalTransfersCount, setTotalTransfersCount] = useState<bigint | undefined>(undefined); // State for total count

//     // Ref for the debounce timeout
//     const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

//     // --- Query for total transfers count ---
//     const { data: totalCountQueryResult, isLoading: isLoadingTotalCount } = useReadContract({
//         address: pstContractAddress,
//         abi: PST_CONTRACT_ABI,
//         functionName: 'getTotalTransfersByAddress', // This function now excludes pending transfers
//         args: userAddress ? [userAddress] : undefined,
//         chainId: chain?.id,
//         query: {
//             enabled: !!userAddress && !!pstContractAddress && isConnected,
//             staleTime: 1000 * 60 * 5, // Total count can be stale longer
//             gcTime: 1000 * 60 * 15,
//         }
//     }) as { data?: bigint, isLoading: boolean };

//     useEffect(() => {
//         if (totalCountQueryResult !== undefined) {
//             setTotalTransfersCount(totalCountQueryResult);
//         }
//     }, [totalCountQueryResult]);

//     const totalPages = totalTransfersCount ? Math.ceil(Number(totalTransfersCount) / ITEMS_PER_PAGE) : 0;

//     // 1. Get transfer IDs for the current page
//     // The contract now returns 3 arrays (canceled, expired, claimed)
//     const {
//         data: paginatedTransferIdsQueryResult,
//         isLoading: isLoadingPaginatedTransferIds,
//         isFetching: isFetchingPaginatedTransferIds,
//         error: paginatedTransferIdsError,
//         queryKey: paginatedTransferIdsQueryKey,
//     } = useReadContract({
//         address: pstContractAddress,
//         abi: PST_CONTRACT_ABI,
//         functionName: 'getAllTransfersByAddress', // Contract function now takes pagination args
//         args: userAddress ? [userAddress, BigInt(currentPage * ITEMS_PER_PAGE), BigInt(ITEMS_PER_PAGE)] : undefined,
//         chainId: chain?.id,
//         query: {
//             enabled: !!userAddress && !!pstContractAddress && isConnected,
//             staleTime: 1000 * 30, // Shorter stale time for current page data
//             gcTime: 1000 * 60 * 5,
//         }
//     }) as {
//         // Updated type: now only 3 arrays (canceled, expired, claimed)
//         data?: [bigint[], bigint[], bigint[]],
//         isLoading: boolean,
//         isFetching: boolean,
//         error: Error | null,
//         queryKey: readonly unknown[]
//     };


//     const allUniqueTransferIds = useMemo(() => {
//         if (!paginatedTransferIdsQueryResult) return [];
//         // Updated: only iterate over the 3 arrays now returned by the contract
//         const [canceledIds, expiredIds, claimedIds] = paginatedTransferIdsQueryResult;
//         return Array.from(new Set([
//             ...(canceledIds || []),
//             ...(expiredIds || []),
//             ...(claimedIds || []),
//         ]));
//     }, [paginatedTransferIdsQueryResult]);


//     // 2. Batch fetch transfer details and original amounts for the paginated IDs
//     const {
//         data: transferDetailsAndAmountsData,
//         isLoading: isLoadingDetailsAndAmounts,
//         isFetching: isFetchingDetailsAndAmounts,
//         isError: hasErrorDetailsAndAmounts,
//         error: detailsAndAmountsBatchError,
//         queryKey: detailsAndAmountsQueryKey,
//     } = useReadContracts({
//         contracts: allUniqueTransferIds.map((transferId) => ([
//             {
//                 address: pstContractAddress,
//                 abi: PST_CONTRACT_ABI,
//                 functionName: 'getTransferDetails',
//                 args: [transferId],
//                 chainId: chain?.id,
//             },
//             {
//                 address: pstContractAddress,
//                 abi: PST_CONTRACT_ABI,
//                 functionName: 's_originalAmounts',
//                 args: [transferId],
//                 chainId: chain?.id,
//             },
//         ])).flat(),
//         query: {
//             enabled: allUniqueTransferIds.length > 0 && !!pstContractAddress && !!chain?.id,
//             staleTime: 1000 * 60 * 1, // 1 minute stale time for details
//             gcTime: 1000 * 60 * 5,
//         }
//     }) as {
//         data?: any,
//         isLoading: boolean,
//         isFetching: boolean,
//         isError: boolean,
//         error: Error | null,
//         queryKey: readonly unknown[]
//     };


//     // 3. Extract unique token addresses and prepare queries for their symbols/decimals
//     const uniqueTokenAddresses = useMemo(() => {
//         const addresses = new Set<Address>();
//         if (transferDetailsAndAmountsData) {
//             for (let i = 0; i < transferDetailsAndAmountsData.length; i += 2) {
//                 const detailsResult = transferDetailsAndAmountsData[i];
//                 if (detailsResult.status === 'success' && detailsResult.result) {
//                     const tokenAddress = (detailsResult.result as any[])[2] as Address;
//                     if (tokenAddress !== '0x0000000000000000000000000000000000000000') {
//                         const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id);
//                         if (!networkConfig?.tokens.some(t => t.address.toLowerCase() === tokenAddress.toLowerCase())) {
//                             addresses.add(tokenAddress);
//                         }
//                     }
//                 }
//             }
//         }
//         return Array.from(addresses);
//     }, [transferDetailsAndAmountsData, chain?.id]);


//     const {
//         data: tokenInfoData,
//         isLoading: isLoadingTokenInfo,
//         isFetching: isFetchingTokenInfo,
//         isError: hasErrorTokenInfo,
//         error: tokenInfoBatchError,
//         queryKey: tokenInfoQueryKey,
//     } = useReadContracts({
//         contracts: uniqueTokenAddresses.flatMap((tokenAddress) => [
//             {
//                 address: tokenAddress,
//                 abi: ERC20_CONTRACT_ABI,
//                 functionName: 'symbol',
//                 chainId: chain?.id,
//             },
//             {
//                 address: tokenAddress,
//                 abi: ERC20_CONTRACT_ABI,
//                 functionName: 'decimals',
//                 chainId: chain?.id,
//             },
//         ]),
//         query: {
//             enabled: uniqueTokenAddresses.length > 0 && !!chain?.id,
//             staleTime: Infinity,
//             gcTime: 1000 * 60 * 60 * 24,
//         }
//     }) as {
//         data?: any,
//         isLoading: boolean,
//         isFetching: boolean,
//         isError: boolean,
//         error: Error | null,
//         queryKey: readonly unknown[]
//     };

//     // --- FIX: Declare overallIsLoading and overallHasError BEFORE useMemo ---
//     const overallIsLoading = isLoadingTotalCount || isLoadingPaginatedTransferIds || isLoadingDetailsAndAmounts || isLoadingTokenInfo;
//     const overallHasError = paginatedTransferIdsError || detailsAndAmountsBatchError || tokenInfoBatchError;

//     // 4. Consolidate all data into a single historyTransfers array for rendering
//     const historyTransfers = useMemo(() => {
//         // Condition for initial empty state, handled by overallIsLoading later
//         if (overallIsLoading) return []; // Now `overallIsLoading` is defined
//         if (overallHasError) return [];  // Now `overallHasError` is defined

//         const processedTransfers: {
//             transferId: bigint;
//             sender: Address;
//             receiver: Address;
//             tokenAddress: Address;
//             amount: bigint;
//             creationTime: bigint;
//             expiringTime: bigint;
//             status: string;
//             tokenSymbol: string;
//             tokenDecimals: number;
//         }[] = [];

//         const fetchedTokenMap = new Map<Address, { symbol: string; decimals: number }>();
//         uniqueTokenAddresses.forEach((address, idx) => {
//             const symbolResult = tokenInfoData?.[idx * 2];
//             const decimalsResult = tokenInfoData?.[idx * 2 + 1];
//             if (symbolResult?.status === 'success' && symbolResult.result && decimalsResult?.status === 'success' && decimalsResult.result !== undefined) {
//                 fetchedTokenMap.set(address, {
//                     symbol: symbolResult.result as string,
//                     decimals: decimalsResult.result as number,
//                 });
//             }
//         });

//         allUniqueTransferIds.forEach((transferId, index) => {
//             const detailsResult = transferDetailsAndAmountsData?.[index * 2];
//             const amountResult = transferDetailsAndAmountsData?.[index * 2 + 1];

//             if (detailsResult?.status === 'success' && detailsResult.result &&
//                 amountResult?.status === 'success' && amountResult.result !== undefined) {

//                 const details = detailsResult.result as [Address, Address, Address, bigint, bigint, bigint, string];
//                 const originalAmount = amountResult.result as bigint;

//                 const [sender, receiver, tokenAddress, , creationTime, expiringTime, status] = details;

//                 // No longer need to explicitly filter status === "Pending" here
//                 // as the contract already filters it out for getAllTransfersByAddress.
//                 const isRelatedToCurrentUser =
//                     userAddress?.toLowerCase() === sender.toLowerCase() ||
//                     userAddress?.toLowerCase() === receiver.toLowerCase();

//                 if (!isRelatedToCurrentUser) {
//                     return; // Still only show transfers related to the current user
//                 }

//                 let tokenSymbol: string | undefined;
//                 let tokenDecimals: number | undefined;

//                 if (tokenAddress === '0x0000000000000000000000000000000000000000') {
//                     tokenSymbol = 'ETH';
//                     tokenDecimals = 18;
//                 } else {
//                     const networkConfig = ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id);
//                     const localToken = networkConfig?.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()) as TokenInfo | undefined;
//                     if (localToken) {
//                         tokenSymbol = localToken.symbol;
//                         tokenDecimals = localToken.decimals;
//                     } else {
//                         const fetched = fetchedTokenMap.get(tokenAddress);
//                         if (fetched) {
//                             tokenSymbol = fetched.symbol;
//                             tokenDecimals = fetched.decimals;
//                         } else {
//                             tokenSymbol = 'Unknown';
//                             tokenDecimals = 0;
//                         }
//                     }
//                 }

//                 processedTransfers.push({
//                     transferId,
//                     sender,
//                     receiver,
//                     tokenAddress,
//                     amount: originalAmount,
//                     creationTime,
//                     expiringTime,
//                     status,
//                     tokenSymbol: tokenSymbol || 'Unknown',
//                     tokenDecimals: tokenDecimals || 0,
//                 });
//             }
//         });

//         // Sort by creation time, newest first
//         return processedTransfers.sort((a, b) => {
//             if (a.creationTime > b.creationTime) return -1;
//             if (a.creationTime < b.creationTime) return 1;
//             return 0;
//         });

//     }, [
//         allUniqueTransferIds,
//         transferDetailsAndAmountsData,
//         tokenInfoData,
//         chain?.id,
//         userAddress,
//         overallIsLoading, // Using combined loading state
//         overallHasError
//     ]);

//     // Use isFetching to control the refresh button and spinner
//     const isActivelyFetching = isLoadingTotalCount || isFetchingPaginatedTransferIds || isFetchingDetailsAndAmounts || isFetchingTokenInfo;

//     // Function to handle manual refresh
//     const handleManualRefresh = useCallback(() => {
//         if (!userAddress || !pstContractAddress || !chain?.id) {
//             console.warn("Cannot refresh: Wallet not connected or contract address/chain ID missing.");
//             return;
//         }

//         if (debounceTimeoutRef.current) {
//             clearTimeout(debounceTimeoutRef.current);
//         }

//         debounceTimeoutRef.current = setTimeout(() => {
//             console.log("Attempting to refetch queries manually...");

//             // Refetch total count
//             queryClient.refetchQueries({
//                 queryKey: ['readContract', pstContractAddress, 'getTotalTransfersByAddress', userAddress],
//                 exact: true,
//             }).then(() => console.log('getTotalTransfersByAddress refetch initiated.'));

//             // Refetch paginated transfers
//             queryClient.refetchQueries({
//                 queryKey: paginatedTransferIdsQueryKey,
//                 exact: true,
//             }).then(() => console.log('Paginated transfers refetch initiated.'));

//             // Refetch details and amounts
//             if (detailsAndAmountsQueryKey) {
//                 queryClient.refetchQueries({
//                     queryKey: detailsAndAmountsQueryKey,
//                     exact: true,
//                 }).then(() => console.log("Refetch for detailsAndAmounts initiated."));
//             }

//             // Refetch token info
//             if (tokenInfoQueryKey) {
//                 queryClient.refetchQueries({
//                     queryKey: tokenInfoQueryKey,
//                     exact: true,
//                 }).then(() => console.log("Refetch for tokenInfo initiated."));
//             }

//         }, 300); // Debounce refresh calls by 300ms
//     }, [queryClient, userAddress, chain?.id, pstContractAddress, paginatedTransferIdsQueryKey, detailsAndAmountsQueryKey, tokenInfoQueryKey]);


//     // Effect to trigger refetch when refetchTrigger prop changes (from parent)
//     useEffect(() => {
//         if (refetchTrigger) {
//             handleManualRefresh();
//         }
//     }, [refetchTrigger, handleManualRefresh]);

//     // Cleanup the debounce timeout when the component unmounts
//     useEffect(() => {
//         return () => {
//             if (debounceTimeoutRef.current) {
//                 clearTimeout(debounceTimeoutRef.current);
//             }
//         };
//     }, []);


//     const displayedTitle = useMemo(() => {
//         return componentTitle || "Your Transfer History";
//     }, [componentTitle]);


//     let displayErrorMessage: string | null = null;
//     if (paginatedTransferIdsError) {
//         displayErrorMessage = paginatedTransferIdsError.message;
//     } else if (detailsAndAmountsBatchError) {
//         displayErrorMessage = detailsAndAmountsBatchError.message || "One or more transfer details or amounts failed to load.";
//     } else if (tokenInfoBatchError) {
//         displayErrorMessage = tokenInfoBatchError.message || "One or more token details failed to load.";
//     } else if (totalCountQueryResult === undefined && isLoadingTotalCount === false && !!userAddress && !!pstContractAddress) {
//         // This case handles if getTotalTransfersByAddress fails or returns undefined without an explicit error object
//         displayErrorMessage = "Failed to load total transfer count. Please try refreshing.";
//     }


//     return (
//         <>
//             <div style={historyTransfersContainerStyle}>
//                 <h2 style={historyTransfersTitleStyle}>{displayedTitle}</h2>
//                 {isConnected && userAddress && (
//                     <button
//                         onClick={handleManualRefresh}
//                         style={{
//                             ...refreshButtonStyle,
//                             cursor: isActivelyFetching ? 'not-allowed' : 'pointer', // Use isActivelyFetching
//                             opacity: isActivelyFetching ? 0.7 : 1, // Dim while fetching
//                             transform: isActivelyFetching ? 'rotate(360deg)' : 'rotate(0deg)', // Subtle spin
//                         }}
//                         disabled={isActivelyFetching} // Disable button while fetching
//                     >
//                         <FontAwesomeIcon
//                             icon={faSyncAlt}
//                             spin={isActivelyFetching} // Spin icon when actively fetching
//                             style={{ marginRight: '5px' }}
//                         />
//                         Refresh
//                     </button>
//                 )}

//                 {!isConnected || !userAddress ? (
//                     <p style={disconnectedNetworkStyle}>Connect your wallet to see your transfer history.</p>
//                 ) : overallIsLoading && !historyTransfers.length && !overallHasError ? (
//                     <p style={{ textAlign: 'center', color: '#ccc' }}>Loading transfer history...</p>
//                 ) : displayErrorMessage ? (
//                     <p style={{ textAlign: 'center', color: 'red' }}>Error loading history: {displayErrorMessage}</p>
//                 ) : historyTransfers.length === 0 && !isActivelyFetching && totalTransfersCount !== undefined && Number(totalTransfersCount) > 0 && currentPage >= totalPages ? (
//                     // Specific message for when current page is beyond available transfers
//                     <p style={{ textAlign: 'center', color: '#ccc' }}>No transfers found on this page. Try previous pages.</p>
//                 ) : historyTransfers.length === 0 && !isActivelyFetching && (totalTransfersCount === undefined || Number(totalTransfersCount) === 0) ? (
//                     // Show no history only if not actively fetching AND total count is 0 or undefined
//                     <p style={{ textAlign: 'center', color: '#ccc' }}>No transfer history found for your address.</p>
//                 ) : (
//                     <>
//                         <div style={tableContainerStyle}>
//                             <table style={tableStyle}>
//                                 <thead>
//                                     <tr>
//                                         <th style={tableHeaderStyle}>Index</th>
//                                         <th style={tableHeaderStyle}>Sender</th>
//                                         <th style={tableHeaderStyle}>Receiver</th>
//                                         <th style={tableHeaderStyle}>Token</th>
//                                         <th style={tableHeaderStyle}>Amount</th>
//                                         <th style={tableHeaderStyle}>Creation Time</th>
//                                         <th style={tableHeaderStyle}>Expiration Time</th>
//                                         <th style={tableHeaderStyle}>Status</th>
//                                         <th style={tableHeaderStyle}>ID</th>
//                                     </tr>
//                                 </thead>
//                                 <tbody>
//                                     {historyTransfers.map((item, index) => (
//                                         <HistoryTransferRow
//                                             key={item.transferId.toString()}
//                                             index={index + (currentPage * ITEMS_PER_PAGE)} //Adjust index for display
//                                             transferId={item.transferId}
//                                             sender={item.sender}
//                                             receiver={item.receiver}
//                                             tokenAddress={item.tokenAddress}
//                                             amount={item.amount}
//                                             creationTime={item.creationTime}
//                                             expiringTime={item.expiringTime}
//                                             status={item.status}
//                                             userAddress={userAddress}
//                                             tokenSymbol={item.tokenSymbol}
//                                             tokenDecimals={item.tokenDecimals}
//                                             setShowCopiedPopup={setShowLocalCopiedPopup}
//                                         />
//                                     ))}
//                                 </tbody>
//                             </table>
//                         </div>

//                         {/* Pagination Controls */}
//                         {totalTransfersCount !== undefined && totalPages > 0 && (
//                             <div style={paginationContainerStyle}>
//                                 <button
//                                     onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
//                                     disabled={currentPage === 0 || isActivelyFetching}
//                                     style={{
//                                         ...paginationButtonStyle,
//                                         opacity: currentPage === 0 || isActivelyFetching ? 0.5 : 1,
//                                         cursor: currentPage === 0 || isActivelyFetching ? 'not-allowed' : 'pointer',
//                                     }}
//                                 >
//                                     Previous
//                                 </button>
//                                 <span style={{ color: '#ccc', fontSize: '16px' }}>
//                                     Page {currentPage + 1} of {totalPages} (Total: {totalTransfersCount?.toString()})
//                                 </span>
//                                 <button
//                                     onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
//                                     disabled={currentPage >= totalPages - 1 || isActivelyFetching}
//                                     style={{
//                                         ...paginationButtonStyle,
//                                         opacity: currentPage >= totalPages - 1 || isActivelyFetching ? 0.5 : 1,
//                                         cursor: currentPage >= totalPages - 1 || isActivelyFetching ? 'not-allowed' : 'pointer',
//                                     }}
//                                 >
//                                     Next
//                                 </button>
//                             </div>
//                         )}
//                     </>
//                 )}
//             </div>

//             <div style={{
//                 ...copiedPopupStyle,
//                 opacity: showLocalCopiedPopup ? 1 : 0,
//                 visibility: showLocalCopiedPopup ? 'visible' : 'hidden',
//             }}>
//                 Address Copied!
//             </div>
//         </>
//     );
// };

// export default HistoryTransfers;


// src/components/History/History.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { Address, formatUnits } from 'viem';
import type { Abi } from 'viem';

// Import Font Awesome icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faSyncAlt } from '@fortawesome/free-solid-svg-icons';

// Import ABIs
import abiPstWrapper from '../../lib/abis/abi_pst.json';
import erc20AbiJson from '../../lib/abis/abi_erc20.json';

// Import pre-approved tokens list (needed for token decimals lookup)
import { ALL_NETWORK_TOKENS } from '../../lib/constants/tokenList';

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

    // --- Query for total transfers count ---
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

    const totalPages = totalTransfersCount ? Math.ceil(Number(totalTransfersCount) / ITEMS_PER_PAGE) : 0;

    // 1. Get transfer IDs for the current page
    // The contract now returns a single array of combined IDs
    const {
        data: paginatedTransferIdsQueryResult,
        isLoading: isLoadingPaginatedTransferIds,
        isFetching: isFetchingPaginatedTransferIds,
        error: paginatedTransferIdsError,
        queryKey: paginatedTransferIdsQueryKey,
    } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getAllTransfersByAddress',
        args: userAddress ? [userAddress, BigInt(currentPage * ITEMS_PER_PAGE), BigInt(ITEMS_PER_PAGE)] : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!pstContractAddress && isConnected,
            staleTime: 1000 * 30, // Shorter stale time for current page data
            gcTime: 1000 * 60 * 5,
        }
    }) as {
        data?: bigint[], // !! IMPORTANT CHANGE: Expect a single bigint array
        isLoading: boolean,
        isFetching: boolean,
        error: Error | null,
        queryKey: readonly unknown[]
    };


    const allUniqueTransferIds = useMemo(() => {
        if (!paginatedTransferIdsQueryResult) return [];
        // !! IMPORTANT CHANGE: Now paginatedTransferIdsQueryResult is already the combined, sliced array
        return Array.from(new Set(paginatedTransferIdsQueryResult));
    }, [paginatedTransferIdsQueryResult]);


    // 2. Batch fetch transfer details and original amounts for the paginated IDs
    const {
        data: transferDetailsAndAmountsData,
        isLoading: isLoadingDetailsAndAmounts,
        isFetching: isFetchingDetailsAndAmounts,
        isError: hasErrorDetailsAndAmounts,
        error: detailsAndAmountsBatchError,
        queryKey: detailsAndAmountsQueryKey,
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
        queryKey: readonly unknown[]
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
        isError: hasErrorTokenInfo,
        error: tokenInfoBatchError,
        queryKey: tokenInfoQueryKey,
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
        queryKey: readonly unknown[]
    };

    // --- FIX: Declare overallIsLoading and overallHasError BEFORE useMemo ---
    const overallIsLoading = isLoadingTotalCount || isLoadingPaginatedTransferIds || isLoadingDetailsAndAmounts || isLoadingTokenInfo;
    const overallHasError = paginatedTransferIdsError || detailsAndAmountsBatchError || tokenInfoBatchError;

    // 4. Consolidate all data into a single historyTransfers array for rendering
    const historyTransfers = useMemo(() => {
        // Condition for initial empty state, handled by overallIsLoading later
        if (overallIsLoading) return [];
        if (overallHasError) return [];

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

        allUniqueTransferIds.forEach((transferId, index) => {
            // Note: the indices for transferDetailsAndAmountsData are based on allUniqueTransferIds.
            // When allUniqueTransferIds comes directly from paginatedTransferIdsQueryResult,
            // its length and order should match the details/amounts data if successful.
            // No changes needed here, as the mapping logic remains valid.
            const detailsResult = transferDetailsAndAmountsData?.[index * 2];
            const amountResult = transferDetailsAndAmountsData?.[index * 2 + 1];

            if (detailsResult?.status === 'success' && detailsResult.result &&
                amountResult?.status === 'success' && amountResult.result !== undefined) {

                const details = detailsResult.result as [Address, Address, Address, bigint, bigint, bigint, string];
                const originalAmount = amountResult.result as bigint;

                const [sender, receiver, tokenAddress, , creationTime, expiringTime, status] = details;

                // No longer need to explicitly filter status === "Pending" here
                // as the contract already filters it out for getAllTransfersByAddress.
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

        // Sort by creation time, newest first
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

    // Use isFetching to control the refresh button and spinner
    const isActivelyFetching = isLoadingTotalCount || isFetchingPaginatedTransferIds || isFetchingDetailsAndAmounts || isFetchingTokenInfo;

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

            // Refetch paginated transfers
            queryClient.refetchQueries({
                queryKey: paginatedTransferIdsQueryKey,
                exact: true,
            }).then(() => console.log('Paginated transfers refetch initiated.'));

            // Refetch details and amounts
            if (detailsAndAmountsQueryKey) {
                queryClient.refetchQueries({
                    queryKey: detailsAndAmountsQueryKey,
                    exact: true,
                }).then(() => console.log("Refetch for detailsAndAmounts initiated."));
            }

            // Refetch token info
            if (tokenInfoQueryKey) {
                queryClient.refetchQueries({
                    queryKey: tokenInfoQueryKey,
                    exact: true,
                }).then(() => console.log("Refetch for tokenInfo initiated."));
            }

        }, 300); // Debounce refresh calls by 300ms
    }, [queryClient, userAddress, chain?.id, pstContractAddress, paginatedTransferIdsQueryKey, detailsAndAmountsQueryKey, tokenInfoQueryKey]);


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
    if (paginatedTransferIdsError) {
        displayErrorMessage = paginatedTransferIdsError.message;
    } else if (detailsAndAmountsBatchError) {
        displayErrorMessage = detailsAndAmountsBatchError.message || "One or more transfer details or amounts failed to load.";
    } else if (tokenInfoBatchError) {
        displayErrorMessage = tokenInfoBatchError.message || "One or more token details failed to load.";
    } else if (totalCountQueryResult === undefined && isLoadingTotalCount === false && !!userAddress && !!pstContractAddress) {
        // This case handles if getTotalTransfersByAddress fails or returns undefined without an explicit error object
        displayErrorMessage = "Failed to load total transfer count. Please try refreshing.";
    }


    return (
        <>
            <div className={styles.historyTransfersContainer}>
                <h2 className={styles.historyTransfersTitle}>{displayedTitle}</h2>
                {isConnected && userAddress && (
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
                )}

                {!isConnected || !userAddress ? (
                    <p className={styles.disconnectedNetwork}>Connect your wallet to see your transfer history.</p>
                ) : overallIsLoading && !historyTransfers.length && !overallHasError ? (
                    <p className={styles.loadingMessage}>Loading transfer history...</p>
                ) : displayErrorMessage ? (
                    <p className={styles.errorMessage}>Error loading history: {displayErrorMessage}</p>
                ) : historyTransfers.length === 0 && !isActivelyFetching && totalTransfersCount !== undefined && Number(totalTransfersCount) > 0 && currentPage >= totalPages ? (
                    // Specific message for when current page is beyond available transfers
                    <p className={styles.loadingMessage}>No transfers found on this page. Try previous pages.</p>
                ) : historyTransfers.length === 0 && !isActivelyFetching && (totalTransfersCount === undefined || Number(totalTransfersCount) === 0) ? (
                    // Show no history only if not actively fetching AND total count is 0 or undefined
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
                                    {historyTransfers.map((item, index) => (
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
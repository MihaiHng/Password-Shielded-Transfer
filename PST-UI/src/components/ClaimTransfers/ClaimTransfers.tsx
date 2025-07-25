// src/components/ClaimTransfers/ClaimTransfers.tsx

import React, { useCallback, useMemo } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Address } from 'viem';
import type { Abi } from 'viem';
import { useQueryClient } from '@tanstack/react-query'; // Import useQueryClient

// Import the PendingTransfers component
import PendingTransfers from '../PendingTransfers/PendingTransfers';

// Import the new CSS Module
import styles from './ClaimTransfers.module.css';

// Import the ABI for PSTWrapper (Ensure this path is consistent with CreateTransfers.tsx)
import abiPstWrapper from '../../utils/abis/abi_pst.json';

// Consider creating a shared constants file for ABIs and contract addresses
// if they are used across multiple components to ensure single source of truth
// For example: import { PST_CONTRACT_ABI } from '../../lib/constants/abis';
// For now, keep as is for direct fix.

// Type assertion for ABI
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

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

// --- CLAIM TRANSFERS MAIN COMPONENT ---
interface ClaimTransfersProps {
    // No specific props needed for this component itself currently
}

const ClaimTransfers: React.FC<ClaimTransfersProps> = () => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const queryClient = useQueryClient(); // Initialize queryClient

    // Determine the correct PST contract address for the current chain
    const pstContractAddressForChain = useMemo(() => getPSTContractAddress(chain?.id), [chain?.id]);

    // Fetch the cancelationCooldown from the contract
    const { data: cancelCooldownPeriod, isLoading: isLoadingCancelCooldown, error: cancelCooldownError } = useReadContract({
        address: pstContractAddressForChain,
        abi: PST_CONTRACT_ABI,
        functionName: 's_cancelCooldownPeriod',
        chainId: chain?.id,
        query: {
            enabled: isConnected && !!pstContractAddressForChain,
            staleTime: Infinity, // This value is unlikely to change
        },
    }) as { data?: bigint, isLoading: boolean, error?: Error };

    // Callback function to be passed to PendingTransfers.
    // This callback is now for informational purposes to the parent.
    // The actual cache invalidation/refetch for the list should happen INSIDE PendingTransfers
    // or through a more targeted invalidation here if ClaimTransfers itself triggers an action.
    const handleTransferActionCompleted = useCallback((transferId: bigint) => {
        console.log(`[ClaimTransfers] Action completed for transfer ID: ${transferId} in child component.`);
        // For 'ClaimTransfers', a completed claim means a transfer has been removed or status changed.
        // Invalidate the relevant query to refetch the list.
        // This mirrors the invalidation logic in CreateTransfers and the actions buttons themselves.

        // Invalidate 'All System Pending Transfers'
        if (pstContractAddressForChain && chain?.id) {
            queryClient.invalidateQueries({
                queryKey: ['readContract', {
                    address: pstContractAddressForChain,
                    abi: PST_CONTRACT_ABI,
                    functionName: 'getPendingTransfers',
                    chainId: chain.id
                }],
                refetchType: 'active'
            });
            console.log("[ClaimTransfers] Invalidated 'getPendingTransfers' query.");
        }

        // Invalidate 'Your Received Pending Transfers' (which is the main type here)
        if (userAddress && pstContractAddressForChain && chain?.id) {
            queryClient.invalidateQueries({
                queryKey: ['readContract', {
                    address: pstContractAddressForChain,
                    abi: PST_CONTRACT_ABI,
                    functionName: 'getPendingTransfersForAddress',
                    args: [userAddress], // IMPORTANT: Include userAddress for received transfers too!
                    chainId: chain.id
                }],
                refetchType: 'active'
            });
            console.log("[ClaimTransfers] Invalidated 'getPendingTransfersForAddress' query for user:", userAddress);
        }
    }, [queryClient, userAddress, pstContractAddressForChain, chain?.id, PST_CONTRACT_ABI]);


    return (
        <div className={styles.claimTransfersContainer}>
            {!isConnected || !userAddress ? (
                <p className={styles.disconnectedNetwork}>
                    Connect your wallet to see transfers waiting to be claimed.
                </p>
            ) : (
                // Render the PendingTransfers component
                // Removed refetchTrigger as it's no longer used/needed.
                <PendingTransfers
                    pstContractAddress={pstContractAddressForChain}
                    type="received" // CRITICAL: This prop tells PendingTransfers to filter for received transfers
                    onTransferActionCompleted={handleTransferActionCompleted} // Pass the callback for post-action invalidation
                    componentTitle="Transfers Waiting To Be Claimed"
                    // Pass the cancelCooldownPeriod and its states
                    cancelCooldownPeriod={cancelCooldownPeriod}
                    isLoadingCancelCooldown={isLoadingCancelCooldown}
                    cancelCooldownError={cancelCooldownError}
                />
            )}
        </div>
    );
};

export default ClaimTransfers;
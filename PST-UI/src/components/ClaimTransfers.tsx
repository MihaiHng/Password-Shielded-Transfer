// src/components/ClaimTransfers.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Address } from 'viem';
import type { Abi } from 'viem';

// Import the PendingTransfers component
import PendingTransfers from './PendingTransfers';

// Import React's CSSProperties type
import type { CSSProperties } from 'react';

// Import the ABI for PSTWrapper
import abiPstWrapper from '../lib/abis/abi_pst.json';

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

// --- STYLES FOR CLAIMABLE TRANSFERS SECTION ---
const claimTransfersContainerStyle: CSSProperties = {
    maxWidth: '1200px', // Adjust as needed for your layout
    margin: '40px auto',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const disconnectedNetworkStyle: CSSProperties = {
    fontSize: '14px',
    color: 'red',
    textAlign: 'center',
    marginBottom: '20px',
};


// --- CLAIM TRANSFERS MAIN COMPONENT ---
interface ClaimTransfersProps {
    // No specific props needed for now, it delegates state management to PendingTransfers
}

const ClaimTransfers: React.FC<ClaimTransfersProps> = () => {
    const { address: userAddress, chain, isConnected } = useAccount();

    // Determine the correct PST contract address for the current chain
    const pstContractAddressForChain = useMemo(() => getPSTContractAddress(chain?.id), [chain?.id]);

    // State to trigger a refetch of the PendingTransfers component when an action (like claim) is completed
    const [refetchPendingTrigger, setRefetchPendingTrigger] = useState<boolean>(false);

    // --- NEW: Fetch the cancelationCooldown from the contract ---
    const { data: cancelCooldownPeriod, isLoading: isLoadingCancelCooldown, error: cancelCooldownError } = useReadContract({
        address: pstContractAddressForChain,
        abi: PST_CONTRACT_ABI,
        // FIX: Changed functionName to 's_cancelCooldownPeriod'
        functionName: 's_cancelCooldownPeriod',
        chainId: chain?.id,
        query: {
            enabled: isConnected && !!pstContractAddressForChain,
            staleTime: Infinity, // This value is usually constant, so fetch once
        },
    }) as { data?: bigint, isLoading: boolean, error?: Error };

    // Callback function to be passed to PendingTransfers.
    // When an action (e.g., claiming a transfer) is completed within PendingTransfers,
    // this function will be called, triggering a re-render and re-fetch of the list.
    const handleTransferActionCompleted = useCallback((transferId: bigint) => {
        console.log(`[ClaimTransfers] Action completed for transfer ID: ${transferId}. Triggering refetch.`);
        // Toggle the state to force PendingTransfers to refetch its data
        setRefetchPendingTrigger(prev => !prev);
    }, []);

    return (
        <div style={claimTransfersContainerStyle}>
            {!isConnected || !userAddress ? (
                <p style={disconnectedNetworkStyle}>Connect your wallet to see transfers waiting to be claimed.</p>
            ) : (
                // Render the PendingTransfers component
                // It will now fetch, filter, and display the relevant transfers for claiming.
                <PendingTransfers
                    pstContractAddress={pstContractAddressForChain}
                    refetchTrigger={refetchPendingTrigger}
                    type="received" // CRITICAL: This prop tells PendingTransfers to filter for received transfers
                    onTransferActionCompleted={handleTransferActionCompleted}
                    // NEW: Pass the title string to PendingTransfers
                    componentTitle="Transfers Waiting To Be Claimed"
                    // --- NEW: Pass the cancelCooldownPeriod and its states ---
                    cancelCooldownPeriod={cancelCooldownPeriod}
                    isLoadingCancelCooldown={isLoadingCancelCooldown}
                    cancelCooldownError={cancelCooldownError}
                />
            )}
        </div>
    );
};

export default ClaimTransfers;
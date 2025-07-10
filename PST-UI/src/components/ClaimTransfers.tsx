// src/components/ClaimTransfers.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi'; // Only useAccount is needed here now
import { Address } from 'viem';

// Import the PendingTransfers component
import PendingTransfers from './PendingTransfers';

// Import React's CSSProperties type
import type { CSSProperties } from 'react';

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
// These styles are specific to the container of the ClaimTransfers page content.
// Note: The table styles are now encapsulated within PendingTransfers.tsx
const claimTransfersContainerStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '1200px', // Adjust as needed for your layout
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const claimTransfersTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
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
            <h2 style={claimTransfersTitleStyle}>Transfers Waiting For You To Claim</h2>

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
                />
            )}
        </div>
    );
};

export default ClaimTransfers;
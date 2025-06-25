// src/components/CancelTransferButton.tsx

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useAccount } from 'wagmi';
import type { Address, Abi } from 'viem';

// Import ABIs (assuming they are correctly path-configured or available globally in your project)
import abiPstWrapper from '../lib/abis/abi_pst.json'; // Ensure this path is correct

// Type assertion for PST ABI
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

// Re-using styles from CreateTransfer/PendingTransfers for consistency
interface CSSProperties {
    [key: string]: string | number | undefined;
}

const formButtonStyle: CSSProperties = {
    padding: '8px 12px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(to right, #ff007a, #9900ff)',
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.2)',
    width: '100%',
    textAlign: 'center',
};

const disabledButtonStyle: CSSProperties = {
    ...formButtonStyle,
    background: '#E0E0E0',
    cursor: 'not-allowed',
    boxShadow: 'none',
};

interface CancelTransferButtonProps {
    transferId: bigint;
    pstContractAddress: Address;
    senderAddress: Address; // The sender of the transfer
    transferStatus: string; // The current status of the transfer (e.g., "Pending", "Claimed", "Canceled")
    chainId: number;
    onCancelSuccess: () => void; // Callback to trigger parent refetch
}

const CancelTransferButton: React.FC<CancelTransferButtonProps> = ({
    transferId,
    pstContractAddress,
    senderAddress,
    transferStatus,
    chainId,
    onCancelSuccess,
}) => {
    const { address: userAddress, isConnected } = useAccount();

    // Determine if the connected user is the sender of this transfer
    const isCurrentUserSender = userAddress?.toLowerCase() === senderAddress.toLowerCase();

    // Determine if the transfer is in a cancellable state ("Pending")
    const isCancellableStatus = transferStatus === "Pending";

    // Combined condition for button enablement logic
    const canAttemptCancellation = isConnected && isCurrentUserSender && isCancellableStatus && !!pstContractAddress;

    // Use simulateContract for pre-flight check
    const { data: simulateData, error: simulateError, isLoading: isSimulating } = useSimulateContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'cancelTransfer',
        args: [transferId],
        chainId: chainId,
        query: {
            enabled: canAttemptCancellation, // Only enable simulation if basic conditions are met
            staleTime: 5000,
            refetchOnWindowFocus: false,
        }
    });

    const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
        hash: txHash,
        query: {
            enabled: !!txHash,
        }
    });

    // Handle success: trigger refetch and clear any local states
    useEffect(() => {
        if (isConfirmed) {
            onCancelSuccess();
        }
    }, [isConfirmed, onCancelSuccess]);

    // Error handling (simplified for this component)
    const displayError = simulateError || writeError || confirmError;
    const errorMessage = displayError ? (displayError as any).shortMessage || displayError.message : '';

    const handleCancel = async () => {
        if (!canAttemptCancellation) {
            // This should ideally not be reachable if button is disabled correctly
            alert("Cannot cancel: Conditions not met (e.g., not sender, not pending, or wallet not connected).");
            return;
        }
        if (!simulateData?.request) {
            alert(`Cancellation pre-check failed: ${errorMessage || 'Unknown error'}`);
            console.error("Simulation data not available for cancellation:", simulateError);
            return;
        }

        try {
            writeContract(simulateData.request);
        } catch (e) {
            console.error("Error initiating cancel transaction:", e);
            alert(`Error cancelling transfer: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // Determine button text and style
    let buttonText = "Cancel";
    let currentButtonStyle = formButtonStyle;
    let isDisabled = true; // Default to disabled

    if (!isConnected) {
        buttonText = "Connect Wallet";
        isDisabled = true;
    } else if (!isCurrentUserSender) {
        buttonText = "Not Your Transfer";
        isDisabled = true;
    } else if (!isCancellableStatus) {
        buttonText = `Status: ${transferStatus}`; // Show current status if not pending
        isDisabled = true;
    } else if (isSimulating) {
        buttonText = "Pre-checking...";
        isDisabled = true;
    } else if (simulateError) {
        buttonText = "Cannot Cancel"; // Indicating pre-check failed
        isDisabled = true;
    } else if (isWritePending) {
        buttonText = "Confirm Wallet...";
        isDisabled = true;
    } else if (isConfirming) {
        buttonText = "Cancelling...";
        isDisabled = true;
    } else if (isConfirmed) {
        buttonText = "Canceled!";
        currentButtonStyle = { ...formButtonStyle, background: '#4CAF50' }; // Green for success
        isDisabled = true; // Disabled after success
    } else if (simulateData?.request) { // If simulation passed and no other states are active
        buttonText = "Cancel";
        isDisabled = false;
    } else {
        // Fallback for when all conditions aren't met but no specific error/state
        buttonText = "Cannot Cancel";
        isDisabled = true;
    }


    return (
        <div>
            <button
                onClick={handleCancel}
                style={isDisabled ? disabledButtonStyle : currentButtonStyle}
                disabled={isDisabled}
            >
                {buttonText}
            </button>
            {errorMessage && (
                <p style={{ color: 'red', fontSize: '10px', marginTop: '5px' }}>
                    {errorMessage.includes("User rejected") ? "User rejected transaction." : `Error: ${errorMessage}`}
                </p>
            )}
        </div>
    );
};

export default CancelTransferButton;

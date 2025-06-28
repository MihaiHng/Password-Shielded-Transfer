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

interface CustomError extends Error {
    cause?: unknown; // 'cause' can be of any type
    shortMessage?: string; // wagmi/viem often adds this
    details?: string; // another common detail field
    data?: { // sometimes viem errors include a 'data' field
        message?: string;
        data?: unknown; // nested data
    };
}

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

    // Function to get a user-friendly error message for this component
    const getUserFriendlyErrorMessage = (error: Error | null): string => {
        if (!error) return '';

        console.error("Error received by getUserFriendlyErrorMessage:", error);

        const customError = error as CustomError;
        let extractedMessage = customError.shortMessage || customError.message || String(error);
        const customErrorPattern = /Error: ([A-Za-z0-9_]+\(\))(?:\s+\(.*\))?/;

        let match = extractedMessage.match(customErrorPattern);
        if (match && match[1]) {
            const customErrorName = match[1];
            switch (customErrorName) {
                case "PST__CantSendToOwnAddress()":
                    return "Error: Cannot send to own address.";
                case "PST__AmountToSendShouldBeHigher()":
                    return "Error: Amount too low.";
                case "PST__PasswordNotProvided()":
                    return "Error: Password not provided.";
                case "PST__PasswordTooShort()":
                    return "Error: Password too short.";
                // Removed PST__CooldownPeriodElapsed() from here as it will be handled by button state directly
                default:
                    return `Contract Error: ${customErrorName.replace(/PST__/g, '').replace(/\(\)/g, '')}`;
            }
        }

        if (customError.cause && typeof customError.cause === 'object') {
            const causeAsAny = customError.cause as any;
            const causeMessages = [
                causeAsAny.shortMessage,
                causeAsAny.message,
                causeAsAny.reason,
                causeAsAny.data?.message
            ].filter(Boolean) as string[];

            for (const msg of causeMessages) {
                match = msg.match(customErrorPattern);
                if (match && match[1]) {
                    const customErrorName = match[1];
                    switch (customErrorName) {
                        case "PST__CantSendToOwnAddress()":
                            return "Error: Cannot send to own address.";
                        case "PST__AmountToSendShouldBeHigher()":
                            return "Error: Amount too low.";
                        case "PST__PasswordNotProvided()":
                            return "Error: Password not provided.";
                        case "PST__PasswordTooShort()":
                            return "Error: Password too short.";
                        // Removed PST__CooldownPeriodElapsed() from here
                        default:
                            return `Contract Error: ${customErrorName.replace(/PST__/g, '').replace(/\(\)/g, '')}`;
                    }
                }
            }
        }

        if (extractedMessage.includes("User rejected the request")) {
            return "Transaction rejected by user.";
        }
        if (extractedMessage.includes("insufficient funds for gas")) {
            return "Error: Insufficient funds for gas.";
        }
        if (extractedMessage.includes("ChainMismatchError")) {
            return "Wallet/Network Mismatch.";
        }
        if (extractedMessage.includes("revert")) {
            return "Transaction reverted.";
        }

        return `Error: ${extractedMessage}`;
    };

    // Error handling for general errors to be displayed below the button
    const displayErrorForMessage = simulateError || writeError || confirmError;
    // Check if the specific cooldown error is present, if so, don't show general error message
    const isCooldownPeriodElapsedError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__CooldownPeriodElapsed()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__CooldownPeriodElapsed()");
    const errorMessage = isCooldownPeriodElapsedError ? '' : getUserFriendlyErrorMessage(displayErrorForMessage);


    const handleCancel = async () => {
        if (!canAttemptCancellation) {
            alert("Cannot cancel: Conditions not met (e.g., not sender, not pending, or wallet not connected).");
            return;
        }
        // No need to check simulateData?.request explicitly here, button disabled state handles it.

        try {
            if (simulateData?.request) {
                writeContract(simulateData.request);
            } else {
                // This case means simulateData was null/undefined or request was missing,
                // and should be caught by isDisabled = true.
                alert(`Cancellation pre-check failed: ${errorMessage || 'Unknown error. Check console.'}`);
                console.error("Simulation data not available for cancellation, but button was clicked. SimulateError:", simulateError);
            }
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
    } else if (simulateError && isCooldownPeriodElapsedError) { // Specific handling for cooldown elapsed
        buttonText = "Cancellation period elapsed";
        isDisabled = true;
    } else if (simulateError) { // General simulation error (not cooldown related)
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
            {errorMessage && ( // Only show general error message if it's not the cooldown elapsed error
                <p style={{ color: 'red', fontSize: '10px', marginTop: '5px' }}>
                    {errorMessage.includes("User rejected") ? "User rejected transaction." : `Error: ${errorMessage}`}
                </p>
            )}
        </div>
    );
};

export default CancelTransferButton;

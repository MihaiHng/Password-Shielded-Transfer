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
    borderRadius: '12樺px',
    border: 'none',
    background: 'linear-gradient(to right, #ff4d4f, #cc0000)', // More red for cancel
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
    background: '#555', // Darker gray for disabled
    color: '#aaa',
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

// ** THIS IS THE CORRECTED INTERFACE DEFINITION **
interface CancelTransferButtonProps {
    transferId: bigint;
    pstContractAddress: Address;
    senderAddress: Address; // The sender of the transfer
    transferStatus: string; // The current status of the transfer (e.g., "Pending", "Claimed", "Canceled")
    creationTime: bigint; // Time when the transfer was created
    cancelationCooldown: bigint; // Cooldown period during which cancellation is allowed
    chainId: number;
    onCancelActionCompleted: (transferId: bigint) => void; // CORRECTED: Callback to trigger parent refetch with the ID
}

const CancelTransferButton: React.FC<CancelTransferButtonProps> = ({
    transferId,
    pstContractAddress,
    senderAddress,
    transferStatus,
    creationTime,       // Destructure new props
    cancelationCooldown, // Destructure new props
    chainId,
    // ** THIS IS THE CORRECTED PROP DESTRUCTURING **
    onCancelActionCompleted, // Destructure the correctly named prop
}) => {
    const { address: userAddress, isConnected } = useAccount();

    // Determine if the connected user is the sender of this transfer
    const isCurrentUserSender = userAddress?.toLowerCase() === senderAddress.toLowerCase();

    // Determine if the transfer is in a cancellable state ("Pending")
    const isPendingStatus = transferStatus === "Pending";

    // Calculate if the cancellation cooldown period has elapsed
    const now = BigInt(Math.floor(Date.now() / 1000));
    const cooldownPeriodEnd = creationTime + cancelationCooldown;
    const isCooldownElapsed = now > cooldownPeriodEnd;

    // Combined condition for button enablement logic BEFORE simulation
    const canAttemptCancellation = isConnected && isCurrentUserSender && isPendingStatus && !isCooldownElapsed && !!pstContractAddress;

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
            // ** THIS IS THE CORRECTED PROP CALL **
            onCancelActionCompleted(transferId); // Call the correctly named prop
        }
    }, [isConfirmed, onCancelActionCompleted, transferId]); // Ensure dependencies are correct

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
                case "PST__CooldownPeriodElapsed()": // Handle this specific error
                    return "Error: Cancellation period elapsed.";
                case "PST__TransferNotPending()": // Handle case if status changed
                    return "Error: Transfer is no longer pending.";
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
                        case "PST__CooldownPeriodElapsed()":
                            return "Error: Cancellation period elapsed.";
                        case "PST__TransferNotPending()":
                            return "Error: Transfer is no longer pending.";
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

    // Check for explicit cooldown elapsed or transfer not pending errors from simulation/contract
    const isExplicitCooldownElapsedError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__CooldownPeriodElapsed()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__CooldownPeriodElapsed()");
    const isTransferNotPendingError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__TransferNotPending()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__TransferNotPending()");

    // Only show a generic error message if it's not one of our specifically handled statuses/errors
    const errorMessage = (displayErrorForMessage && !isExplicitCooldownElapsedError && !isTransferNotPendingError)
        ? getUserFriendlyErrorMessage(displayErrorForMessage)
        : '';


    const handleCancel = async () => {
        if (!canAttemptCancellation) {
            // Provide more specific alerts here based on which condition failed
            if (!isConnected) alert('Please connect your wallet.');
            else if (!isCurrentUserSender) alert('Only the sender can cancel this transfer.');
            else if (!isPendingStatus) alert('This transfer is not in a pending state.');
            else if (isCooldownElapsed) alert('The cancellation period for this transfer has elapsed.');
            else alert("Cannot cancel: Unknown condition not met.");
            return;
        }

        try {
            if (simulateData?.request) {
                writeContract(simulateData.request);
            } else {
                alert(`Cancellation pre-check failed: ${errorMessage || getUserFriendlyErrorMessage(simulateError) || 'Unknown simulation error. Check console.'}`);
                console.error("Simulation data not available for cancellation, but button was clicked. SimulateError:", simulateError);
            }
        } catch (e) {
            console.error("Error initiating cancel transaction:", e);
            alert(`Error cancelling transfer: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // Determine button text and style based on all conditions
    let buttonText = "Cancel";
    let currentButtonStyle = formButtonStyle;
    let isDisabled = true; // Default to disabled

    if (!isConnected) {
        buttonText = "Connect Wallet";
    } else if (!isCurrentUserSender) {
        buttonText = "Not Your Transfer";
    } else if (!isPendingStatus) {
        buttonText = `Status: ${transferStatus}`; // Show current status if not pending
    } else if (isCooldownElapsed) { // Check cooldown *before* simulation logic for immediate feedback
        buttonText = "Cancellation Period Elapsed";
    } else if (isSimulating) {
        buttonText = "Pre-checking...";
    } else if (simulateError) {
        // If simulation failed, and it's not a known, handled-by-text error, then button shows "Cannot Cancel"
        buttonText = "Cannot Cancel";
    } else if (isWritePending) {
        buttonText = "Confirm Wallet...";
    } else if (isConfirming) {
        buttonText = "Cancelling...";
    } else if (isConfirmed) {
        buttonText = "Canceled!";
        currentButtonStyle = { ...formButtonStyle, background: '#4CAF50' }; // Green for success
    } else if (simulateData?.request) { // If simulation passed and no other states are active
        buttonText = "Cancel";
        isDisabled = false; // Enable the button!
    }

    // Apply disabled style if isDisabled is true, otherwise use currentButtonStyle
    const finalButtonStyle = isDisabled ? disabledButtonStyle : currentButtonStyle;

    return (
        <div>
            <button
                onClick={handleCancel}
                style={finalButtonStyle}
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
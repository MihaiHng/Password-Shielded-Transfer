// src/components/ClaimTransferButton.tsx

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useAccount } from 'wagmi';
import type { Address, Abi } from 'viem';

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json'; // Ensure this path is correct

// Type assertion for PST ABI
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

interface CSSProperties {
    [key: string]: string | number | undefined;
}

const buttonStyle: CSSProperties = {
    padding: '8px 12px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(to right, #6EE7B7, #3B82F6)', // Green-blue gradient for Claim
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
    ...buttonStyle,
    background: '#E0E0E0',
    cursor: 'not-allowed',
    boxShadow: 'none',
};

// Define a custom error interface to safely access 'cause'
// Removed 'message?: string;' as it conflicts with Error interface's 'message: string'
interface CustomError extends Error {
    cause?: unknown;
    shortMessage?: string;
    details?: string;
    data?: { message?: string; data?: unknown; };
}

interface ClaimTransferButtonProps {
    transferId: bigint;
    pstContractAddress: Address;
    chainId: number;
    password: string; // Password from the input field
    receiverAddress: Address; // The receiver address of this specific transfer
    transferStatus: string; // Current status of the transfer
    onClaimSuccess: () => void; // Callback to trigger parent refetch
}

const ClaimTransferButton: React.FC<ClaimTransferButtonProps> = ({
    transferId,
    pstContractAddress,
    chainId,
    password,
    receiverAddress,
    transferStatus,
    onClaimSuccess,
}) => {
    const { address: userAddress, isConnected } = useAccount();

    const isCurrentUserReceiver = userAddress?.toLowerCase() === receiverAddress.toLowerCase();
    const isTransferPending = transferStatus === "Pending";
    const isPasswordProvided = password.length > 0;

    // Condition to enable simulation query
    const canAttemptClaim = isConnected && isCurrentUserReceiver && isTransferPending && isPasswordProvided && !!pstContractAddress;

    // Simulate the claimTransfer transaction
    const { data: simulateData, error: simulateError, isLoading: isSimulating } = useSimulateContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'claimTransfer',
        args: [transferId, password],
        chainId: chainId,
        query: {
            enabled: canAttemptClaim, // Only run simulation if basic conditions met
            staleTime: 5000,
            refetchOnWindowFocus: false,
            refetchInterval: false,
        }
    });

    const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
        hash: txHash,
        query: {
            enabled: !!txHash,
        }
    });

    // Trigger refetch on success
    useEffect(() => {
        if (isConfirmed) {
            onClaimSuccess();
        }
    }, [isConfirmed, onClaimSuccess]);

    // Function to get a user-friendly error message
    const getUserFriendlyErrorMessage = (error: Error | null): string => {
        if (!error) return '';

        console.error("Error received by getUserFriendlyErrorMessage:", error);

        const customError = error as CustomError;
        // Use customError.shortMessage or customError.message directly from Error interface
        let extractedMessage = customError.shortMessage || error.message || String(error);
        const customErrorPattern = /Error: ([A-Za-z0-9_]+\(\))(?:\s+\(.*\))?/;

        let match = extractedMessage.match(customErrorPattern);
        if (match && match[1]) {
            const customErrorName = match[1];
            switch (customErrorName) {
                case "PST__InvalidReceiver()":
                    return "Error: You are not the valid receiver for this transfer.";
                case "PST__PasswordNotProvided()":
                    return "Error: Password not provided.";
                case "PST__PasswordTooShort()":
                    return "Error: Password too short. Please check the required length.";
                case "PST__IncorrectPassword()":
                    return "Error: Incorrect password.";
                case "PST__TransferFailed()":
                    return "Error: Token transfer failed during claim.";
                case "PST__ClaimCooldownNotElapsed()": // This is from the modifier 'claimCooldownElapsed'
                    return "Claim period not yet elapsed.";
                case "PST__NotPendingTransfer()": // From onlyPendingTransfers modifier if status is not pending
                    return "Transfer is not in pending status.";
                case "PST__TransferExpired()": // Implicit check by contract if expiration time passed
                    return "Error: Transfer has expired.";
                case "PST__InvalidTransferId()": // From onlyValidTransferIds
                    return "Error: Invalid transfer ID.";
                default:
                    return `Contract Error: ${customErrorName.replace(/PST__/g, '').replace(/\(\)/g, '')}`;
            }
        }

        // Check in the 'cause' property if direct match not found
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
                        case "PST__InvalidReceiver()":
                            return "Error: You are not the valid receiver for this transfer.";
                        case "PST__PasswordNotProvided()":
                            return "Error: Password not provided.";
                        case "PST__PasswordTooShort()":
                            return "Error: Password too short. Please check the required length.";
                        case "PST__IncorrectPassword()":
                            return "Error: Incorrect password.";
                        case "PST__TransferFailed()":
                            return "Error: Token transfer failed during claim.";
                        case "PST__ClaimCooldownNotElapsed()":
                            return "Claim period not yet elapsed.";
                        case "PST__NotPendingTransfer()":
                            return "Transfer is not in pending status.";
                        case "PST__TransferExpired()":
                            return "Error: Transfer has expired.";
                        case "PST__InvalidTransferId()":
                            return "Error: Invalid transfer ID.";
                        default:
                            return `Contract Error: ${customErrorName.replace(/PST__/g, '').replace(/\(\)/g, '')}`;
                    }
                }
            }
        }

        if (extractedMessage.includes("User rejected the request") || extractedMessage.includes("user rejected transaction")) {
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

    // Determine the error message to display below the button
    const displayErrorForMessage = simulateError || writeError || confirmError;
    const isClaimCooldownNotElapsedError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__ClaimCooldownNotElapsed()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__ClaimCooldownNotElapsed()");
    const isNotPendingTransferError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__NotPendingTransfer()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__NotPendingTransfer()");
    const isTransferExpiredError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__TransferExpired()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__TransferExpired()");

    // Only show general error message if it's not one of the specific button-text states
    const errorMessage = (isClaimCooldownNotElapsedError || isNotPendingTransferError || isTransferExpiredError) ? '' : getUserFriendlyErrorMessage(displayErrorForMessage);

    const handleClaim = async () => {
        if (!canAttemptClaim) {
            alert("Cannot claim: Conditions not met (e.g., not receiver, not pending, password not provided, or wallet not connected).");
            return;
        }
        if (!simulateData?.request) {
            alert(`Claim pre-check failed: ${errorMessage || 'Unknown error. Check console.'}`);
            console.error("Simulation data not available for claiming:", simulateError);
            return;
        }

        try {
            writeContract(simulateData.request);
        } catch (e) {
            console.error("Error initiating claim transaction:", e);
            alert(`Error claiming transfer: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // Determine button text and style
    let buttonText = "Claim";
    let currentButtonStyle = buttonStyle;
    let isDisabled = true; // Default to disabled

    if (!isConnected) {
        buttonText = "Connect Wallet";
    } else if (!isCurrentUserReceiver) {
        buttonText = "Not Your Transfer";
    } else if (!isTransferPending) {
        buttonText = `Status: ${transferStatus}`; // e.g., "Status: Claimed" or "Status: Canceled"
    } else if (!isPasswordProvided) {
        buttonText = "Enter Password";
    } else if (isSimulating) {
        buttonText = "Pre-checking...";
    } else if (isClaimCooldownNotElapsedError) { // Specific text for cooldown
        buttonText = "Claim period pending";
    } else if (isNotPendingTransferError) { // Specific text for not pending (though already checked by isTransferPending)
        buttonText = "Not Pending";
    } else if (isTransferExpiredError) { // Specific text for expired
        buttonText = "Expired";
    }
    else if (simulateError) { // General simulation error not covered by specific messages
        buttonText = "Cannot Claim";
    } else if (isWritePending) {
        buttonText = "Confirm Wallet...";
    } else if (isConfirming) {
        buttonText = "Claiming...";
    } else if (isConfirmed) {
        buttonText = "Claimed!";
        currentButtonStyle = { ...buttonStyle, background: '#4CAF50' }; // Green for success
    } else if (simulateData?.request) { // If simulation passed and no other states are active
        buttonText = "Claim";
        isDisabled = false; // Enable button
    }

    // Always disable if any transaction is ongoing or basic conditions aren't met
    if (isSimulating || isWritePending || isConfirming || !canAttemptClaim || simulateError) {
        isDisabled = true;
    }

    // Override button style if disabled
    if (isDisabled) {
        currentButtonStyle = disabledButtonStyle;
    }


    return (
        <div>
            <button
                onClick={handleClaim}
                style={currentButtonStyle}
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

export default ClaimTransferButton;

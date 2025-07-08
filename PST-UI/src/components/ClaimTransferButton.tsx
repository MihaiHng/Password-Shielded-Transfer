// src/components/ClaimTransferButton.tsx

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useAccount, useReadContract } from 'wagmi';
import type { Address, Abi } from 'viem';

// Import ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';

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

// Define a custom error interface to safely access 'cause' and potential nested messages
interface CustomError extends Error {
    cause?: { shortMessage?: string; message?: string; reason?: string; data?: { message?: string } } | Error;
    shortMessage?: string; // Sometimes available directly from Wagmi/Viem
    message: string; // Always available
    details?: string; // From Wagmi/Viem if present
    data?: { message?: string; data?: unknown; }; // From Wagmi/Viem if present
}


interface ClaimTransferButtonProps {
    transferId: bigint;
    pstContractAddress: Address;
    chainId: number;
    password: string; // Password from the input field
    receiverAddress: Address; // The receiver address of this specific transfer
    transferStatus: string; // Current status of the transfer
    creationTime: bigint; // creationTime from the transfer details
    onClaimActionCompleted: (claimedTransferId: bigint) => void;
}

const ClaimTransferButton: React.FC<ClaimTransferButtonProps> = ({
    transferId,
    pstContractAddress,
    chainId,
    password,
    receiverAddress,
    transferStatus,
    creationTime,
    onClaimActionCompleted,
}) => {
    const { address: userAddress, isConnected } = useAccount();

    const isCurrentUserReceiver = userAddress?.toLowerCase() === receiverAddress.toLowerCase();
    const isTransferPending = transferStatus === "Pending";
    const isPasswordProvided = password.length > 0;

    // --- Read s_cancelCooldownPeriod ---
    const { data: cancelCooldownPeriod, isLoading: isLoadingCooldownPeriod } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 's_cancelCooldownPeriod',
        chainId: chainId,
        query: {
            staleTime: Infinity,
            enabled: !!pstContractAddress && !!chainId,
        }
    }) as { data?: bigint, isLoading: boolean };

    // --- Calculate if during cancel cooldown ---
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const isDuringCancelCooldown =
        cancelCooldownPeriod !== undefined && // Ensure cooldown period is loaded
        creationTime + cancelCooldownPeriod > currentTime;

    // Condition to enable simulation query
    const shouldEnableSimulation =
        isConnected &&
        isCurrentUserReceiver &&
        isTransferPending &&
        isPasswordProvided &&
        !!pstContractAddress &&
        !isDuringCancelCooldown &&
        !isLoadingCooldownPeriod;

    const { data: simulateData, error: rawSimulateError, isLoading: isSimulating } = useSimulateContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'claimTransfer',
        args: [transferId, password],
        chainId: chainId,
        query: {
            enabled: shouldEnableSimulation, // Only run simulation if conditions met
            staleTime: 5000,
            refetchOnWindowFocus: false,
            refetchInterval: false,
        }
    });

    // --- Managed state for simulateError to prevent stale errors ---
    const [displaySimulateError, setDisplaySimulateError] = useState<CustomError | null>(null);

    useEffect(() => {
        if (shouldEnableSimulation) {
            setDisplaySimulateError(rawSimulateError as CustomError | null);
        } else {
            if (displaySimulateError !== null) {
                setDisplaySimulateError(null);
            }
        }
    }, [shouldEnableSimulation, rawSimulateError, displaySimulateError]);

    // Destructure write and wait for transaction hooks once
    const { writeContract, data: txHash, isPending: isWritePending, error: rawWriteError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, error: rawConfirmError } = useWaitForTransactionReceipt({
        hash: txHash,
        query: {
            enabled: !!txHash,
        }
    });

    // Cast raw errors for consistency
    const writeError = rawWriteError as CustomError | null;
    const confirmError = rawConfirmError as CustomError | null;

    // Trigger refetch on success
    useEffect(() => {
        if (isConfirmed) {
            onClaimActionCompleted(transferId);
        }
    }, [isConfirmed, onClaimActionCompleted, transferId]);

    // Function to get a user-friendly error message
    const getUserFriendlyErrorMessage = (error: Error | null): string => {
        if (!error) return '';
        const customError = error as CustomError;

        let extractedMessage = customError.message || String(error);
        if (customError.shortMessage && customError.shortMessage.length < extractedMessage.length * 2) {
            extractedMessage = customError.shortMessage;
        }

        const customErrorPattern = /Error: ([A-Za-z0-9_]+\(\))(?:\s+\(.*\))?/;

        let match = extractedMessage.match(customErrorPattern);
        if (match && match[1]) {
            const customErrorName = match[1];
            switch (customErrorName) {
                case "PST__InvalidReceiver()": return "You are not the valid receiver for this transfer.";
                case "PST__PasswordNotProvided()": return "Password not provided.";
                case "PST__PasswordTooShort()": return "Password too short. Please check the required length.";
                case "PST__IncorrectPassword()": return "Incorrect password.";
                case "PST__TransferFailed()": return "Token transfer failed during claim.";
                case "PST__CannotClaimInCancelCooldown()": return "Transfer is still in sender's cancellation cooldown.";
                case "PST__CannotClaimYet()": return "Too soon after last attempt.";
                case "PST__NotPendingTransfer()": return "Transfer is not in pending status.";
                case "PST__TransferExpired()": return "Transfer has expired.";
                case "PST__InvalidTransferId()": return "Invalid transfer ID.";
                default: return `Contract Error: ${customErrorName.replace(/PST__/g, '').replace(/\(\)/g, '')}`;
            }
        }
        if (customError.cause) {
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
                        case "PST__InvalidReceiver()": return "You are not the valid receiver for this transfer.";
                        case "PST__PasswordNotProvided()": return "Password not provided.";
                        case "PST__PasswordTooShort()": return "Password too short. Please check the required length.";
                        case "PST__IncorrectPassword()": return "Incorrect password.";
                        case "PST__TransferFailed()": return "Token transfer failed during claim.";
                        case "PST__CannotClaimInCancelCooldown()": return "Transfer is still in sender's cancellation cooldown.";
                        case "PST__CannotClaimYet()": return "Too soon after last attempt.";
                        case "PST__NotPendingTransfer()": return "Transfer is not in pending status.";
                        case "PST__TransferExpired()": return "Transfer has expired.";
                        case "PST__InvalidTransferId()": return "Invalid transfer ID.";
                        default: return `Contract Error: ${customErrorName.replace(/PST__/g, '').replace(/\(\)/g, '')}`;
                    }
                }
            }
        }

        if (extractedMessage.includes("User rejected the request") || extractedMessage.includes("user rejected transaction")) { return "Transaction rejected by user."; }
        if (extractedMessage.includes("insufficient funds for gas")) { return "Insufficient funds for gas."; }
        if (extractedMessage.includes("ChainMismatchError")) { return "Wallet/Network Mismatch."; }
        if (extractedMessage.includes("revert")) { return "Transaction reverted."; }

        return `${extractedMessage}`;
    };

    // Determine the error message to display below the button.
    const displayErrorForMessage = writeError || confirmError || displaySimulateError;

    // Check if the error is one that should be handled by the button's primary message
    const isErrorHandledByButtonLogic = (err: CustomError | null) => {
        if (!err) return false;
        const msg = getUserFriendlyErrorMessage(err);
        return msg === "Transfer is still in sender's cancellation cooldown." ||
            msg === "Transfer has expired." ||
            msg === "Too soon after last attempt." ||
            msg === "Transfer is not in pending status." ||
            msg === "Password not provided.";
    };

    // Only show the red error message if there's an actual error AND it's not handled by the button's primary text.
    const errorMessage = (displayErrorForMessage && !isErrorHandledByButtonLogic(displayErrorForMessage))
        ? getUserFriendlyErrorMessage(displayErrorForMessage)
        : '';


    const handleClaim = async () => {
        if (!isConnected) { alert("Please connect your wallet."); return; }
        if (!isCurrentUserReceiver) { alert("You are not the designated receiver for this transfer."); return; }
        if (!isTransferPending) { alert("This transfer is not pending (it might be claimed or canceled)."); return; }
        if (isLoadingCooldownPeriod) { alert("Still loading cooldown period data. Please wait."); return; }
        if (isDuringCancelCooldown) { alert("This transfer is still within the sender's cancellation cooldown period. You cannot claim it yet."); return; }
        if (!isPasswordProvided) { alert("Please enter the password to claim."); return; }

        if (!simulateData?.request) {
            alert(`Claim pre-check failed: ${errorMessage || 'Unknown error. Check console.'}`);
            return;
        }

        try {
            writeContract(simulateData.request);
        } catch (e) {
            alert(`Error claiming transfer: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // Determine button text and style
    let buttonText = "Claim";
    let currentButtonStyle = buttonStyle;
    let isDisabled = true; // Default to disabled

    // ORDER OF PRECEDENCE FOR BUTTON TEXT IS CRITICAL
    if (!isConnected) {
        buttonText = "Connect Wallet";
    } else if (!isCurrentUserReceiver) {
        buttonText = "Not Your Transfer";
    } else if (!isTransferPending) {
        buttonText = `Status: ${transferStatus}`;
    }
    else if (!isPasswordProvided) {
        buttonText = "Enter Password";
    }
    // Updated message here
    else if (isDuringCancelCooldown) {
        buttonText = "Claim Not Yet Active";
    }
    else if (isLoadingCooldownPeriod) {
        buttonText = "Loading...";
    }
    else if (isSimulating) {
        buttonText = "Pre-checking...";
    }
    else if (displaySimulateError) {
        buttonText = "Cannot Claim";
    }
    else if (isWritePending) {
        buttonText = "Confirm Wallet...";
    } else if (isConfirming) {
        buttonText = "Claiming...";
    } else if (isConfirmed) {
        buttonText = "Claimed!";
        currentButtonStyle = { ...buttonStyle, background: '#4CAF50' };
    }
    else if (simulateData?.request) {
        buttonText = "Claim";
    }

    // Final decision on disabled state:
    if (buttonText === "Claim" && simulateData?.request && !isWritePending && !isConfirming) {
        isDisabled = false;
    } else {
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
            {/* Display error message only if a relevant error exists and it's not handled by button text */}
            {errorMessage && (
                <p style={{ color: 'red', fontSize: '10px', marginTop: '5px' }}>
                    Error: {errorMessage.includes("User rejected") ? "User rejected transaction." : errorMessage}
                </p>
            )}
        </div>
    );
};

export default ClaimTransferButton;
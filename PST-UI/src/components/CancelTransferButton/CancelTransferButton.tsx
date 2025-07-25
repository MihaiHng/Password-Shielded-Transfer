// src/components/CancelTransferButton/CancelTransferButton.tsx

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useAccount } from 'wagmi';
import type { Address, Abi } from 'viem';

import abiPstWrapper from '../../lib/abis/abi_pst.json'; // Adjusted path for nested component

// Import the new CSS Module
import styles from './CancelTransferButton.module.css'; // <<< ONLY THIS LINE CHANGED FOR STYLES IMPORT

const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

interface CustomError extends Error {
    cause?: unknown;
    shortMessage?: string;
    details?: string;
    data?: {
        message?: string;
        data?: unknown;
    };
}

interface CancelTransferButtonProps {
    transferId: bigint;
    pstContractAddress: Address;
    senderAddress: Address;
    transferStatus: string;
    creationTime: bigint;
    cancelationCooldown: bigint;
    chainId: number;
    onCancelActionCompleted: (transferId: bigint) => void;
}

const CancelTransferButton: React.FC<CancelTransferButtonProps> = ({
    transferId,
    pstContractAddress,
    senderAddress,
    transferStatus,
    creationTime,
    cancelationCooldown,
    chainId,
    onCancelActionCompleted,
}) => {
    const { address: userAddress, isConnected } = useAccount();

    const isCurrentUserSender = userAddress?.toLowerCase() === senderAddress.toLowerCase();
    const isPendingStatus = transferStatus === "Pending";

    const now = BigInt(Math.floor(Date.now() / 1000));
    const cooldownPeriodEnd = creationTime + cancelationCooldown;
    const isCooldownElapsed = now > cooldownPeriodEnd;

    // NEW STATE: Tracks if the completion callback has been fired
    const [actionCompletedFired, setActionCompletedFired] = useState(false);

    const canAttemptCancellation = isConnected && isCurrentUserSender && isPendingStatus && !isCooldownElapsed && !!pstContractAddress;

    const { data: simulateData, error: simulateError, isLoading: isSimulating } = useSimulateContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'cancelTransfer',
        args: [transferId],
        chainId: chainId,
        query: {
            enabled: canAttemptCancellation,
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

    useEffect(() => {
        // Only call onCancelActionCompleted if the transaction is confirmed AND
        // the callback hasn't been fired yet for this transaction.
        if (isConfirmed && !actionCompletedFired) {
            onCancelActionCompleted(transferId);
            setActionCompletedFired(true); // Mark as fired
        }
        // OPTIONAL: Reset actionCompletedFired if the transaction hash changes (indicating a new transaction attempt)
        // This allows the button to function correctly if a user tries to cancel again after a previous attempt failed or was reset.
        if (!txHash && actionCompletedFired) {
            setActionCompletedFired(false);
        }
    }, [isConfirmed, onCancelActionCompleted, transferId, actionCompletedFired, txHash]);

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
                case "PST__CooldownPeriodElapsed()":
                    return "Error: Cancellation period elapsed.";
                case "PST__TransferNotPending()":
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

    const displayErrorForMessage = simulateError || writeError || confirmError;

    const isExplicitCooldownElapsedError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__CooldownPeriodElapsed()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__CooldownPeriodElapsed()");
    const isTransferNotPendingError = (displayErrorForMessage as CustomError)?.shortMessage?.includes("PST__TransferNotPending()") || (displayErrorForMessage as CustomError)?.message?.includes("PST__TransferNotPending()");

    const errorMessage = (displayErrorForMessage && !isExplicitCooldownElapsedError && !isTransferNotPendingError)
        ? getUserFriendlyErrorMessage(displayErrorForMessage)
        : '';

    const handleCancel = async () => {
        if (!canAttemptCancellation) {
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

    let buttonText = "Cancel";
    let buttonClassName = styles.formButton; // Use base class from module
    let isDisabled = true;

    if (!isConnected) {
        buttonText = "Connect Wallet";
    } else if (!isCurrentUserSender) {
        buttonText = "Not Your Transfer";
    } else if (!isPendingStatus) {
        buttonText = `Status: ${transferStatus}`;
    } else if (isCooldownElapsed) {
        buttonText = "Cancellation Period Elapsed";
    } else if (isSimulating) {
        buttonText = "Pre-checking...";
    } else if (simulateError) {
        buttonText = "Cannot Cancel";
    } else if (isWritePending) {
        buttonText = "Confirm Wallet...";
    } else if (isConfirming) {
        buttonText = "Cancelling...";
    } else if (isConfirmed) {
        buttonText = "Canceled!";
        buttonClassName = `${styles.formButton} ${styles.formButtonCanceled}`; // Apply specific "Canceled!" style
    } else if (simulateData?.request) {
        buttonText = "Cancel";
        isDisabled = false;
    }

    // Apply disabled style if button is disabled
    if (isDisabled) {
        buttonClassName = `${buttonClassName} ${styles.disabledButton}`;
    }

    return (
        <div className={styles.rootContainer}> {/* Apply the root container style here */}
            <button
                onClick={handleCancel}
                className={buttonClassName}
                disabled={isDisabled}
            >
                {buttonText}
            </button>
            {errorMessage && (
                <p className={styles.errorMessage}> {/* Apply the error message style here */}
                    {errorMessage.includes("User rejected") ? "User rejected transaction." : `Error: ${errorMessage}`}
                </p>
            )}
        </div>
    );
};

export default CancelTransferButton;


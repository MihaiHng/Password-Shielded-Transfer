// src/components/ClaimTransferButton/ClaimTransferButton.tsx

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useAccount, useReadContract } from 'wagmi';
import type { Address, Abi } from 'viem';

// Import ABIs
import abiPstWrapper from '../../lib/abis/abi_pst.json'; // Adjusted path for nested component

// Import the new CSS Module
import styles from './ClaimTransferButton.module.css'; // <<< ONLY THIS LINE CHANGED FOR STYLES IMPORT

// Type assertion for PST ABI
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

// Define a custom error interface to safely access 'cause' and potential nested messages
interface CustomError extends Error {
    cause?: { shortMessage?: string; message?: string; reason?: string; data?: { message?: string } } | Error;
    shortMessage?: string;
    message: string;
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

    const [actionCompletedFired, setActionCompletedFired] = useState(false);

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

    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const isDuringCancelCooldown =
        cancelCooldownPeriod !== undefined &&
        creationTime + cancelCooldownPeriod > currentTime;

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
            enabled: shouldEnableSimulation,
            staleTime: 5000,
            refetchOnWindowFocus: false,
            refetchInterval: false,
        }
    });

    const { writeContract, data: txHash, isPending: isWritePending, error: rawWriteError } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, error: rawConfirmError } = useWaitForTransactionReceipt({
        hash: txHash,
        query: {
            enabled: !!txHash,
        }
    });

    const writeError = rawWriteError as CustomError | null;
    const confirmError = rawConfirmError as CustomError | null;


    const [displaySimulateError, setDisplaySimulateError] = useState<CustomError | null>(null);

    useEffect(() => {
        if (isConfirmed && !actionCompletedFired) {
            onClaimActionCompleted(transferId);
            setActionCompletedFired(true);
        }
        if (!txHash && actionCompletedFired) {
            setActionCompletedFired(false);
        }
        if (shouldEnableSimulation) {
            setDisplaySimulateError(rawSimulateError as CustomError | null);
        } else {
            if (displaySimulateError !== null) {
                setDisplaySimulateError(null);
            }
        }
    }, [isConfirmed, onClaimActionCompleted, transferId, actionCompletedFired, txHash]);


    // useEffect(() => {
    //     if (isConfirmed) {
    //         onClaimActionCompleted(transferId);
    //     }
    // }, [isConfirmed, onClaimActionCompleted, transferId]);

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

    const displayErrorForMessage = writeError || confirmError || displaySimulateError;

    const isErrorHandledByButtonLogic = (err: CustomError | null) => {
        if (!err) return false;
        const msg = getUserFriendlyErrorMessage(err);
        return msg === "Transfer is still in sender's cancellation cooldown." ||
            msg === "Transfer has expired." ||
            msg === "Too soon after last attempt." ||
            msg === "Transfer is not in pending status." ||
            msg === "Password not provided.";
    };

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

    let buttonText = "Claim";
    let buttonClassName = styles.button; // Use base class from module
    let isDisabled = true;

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
        buttonClassName = `${styles.button} ${styles.buttonClaimed}`; // Apply specific "Claimed!" style
    }
    else if (simulateData?.request) {
        buttonText = "Claim";
    }

    if (buttonText === "Claim" && simulateData?.request && !isWritePending && !isConfirming) {
        isDisabled = false;
    } else {
        isDisabled = true;
    }

    // Apply disabled style if button is disabled
    if (isDisabled) {
        buttonClassName = `${buttonClassName} ${styles.disabledButton}`;
    }

    return (
        <div className={styles.rootContainer}> {/* Apply the root container style here */}
            <button
                onClick={handleClaim}
                className={buttonClassName}
                disabled={isDisabled}
            >
                {buttonText}
            </button>
            {errorMessage && (
                <p className={styles.errorMessage}> {/* Apply the error message style here */}
                    Error: {errorMessage.includes("User rejected") ? "User rejected transaction." : errorMessage}
                </p>
            )}
        </div>
    );
};

export default ClaimTransferButton;


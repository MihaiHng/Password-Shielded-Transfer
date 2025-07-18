// src/components/CancelTransferButton.tsx

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useAccount } from 'wagmi';
import type { Address, Abi } from 'viem';

import abiPstWrapper from '../lib/abis/abi_pst.json';

const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;

interface CSSProperties {
    [key: string]: string | number | undefined;
}

// NEW: Style for the root container of the button component
const rootContainerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column', // Stack children (button and message) vertically
    alignItems: 'center',    // Center children horizontally
    width: '100%',           // Take full width of its parent (the actionButtonWrapperStyle div in PendingTransfers)
    // No specific height needed here, let content dictate
};

const formButtonStyle: CSSProperties = {
    padding: '8px 12px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(to right, #ff4d4f, #cc0000)',
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.2)',
    width: '100px',
    flexShrink: 0,
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const disabledButtonStyle: CSSProperties = {
    ...formButtonStyle,
    background: '#555',
    color: '#aaa',
    cursor: 'not-allowed',
    boxShadow: 'none',
};

// NEW: Style for the error message paragraph
const errorMessageStyle: CSSProperties = {
    color: 'red',
    fontSize: '10px',
    marginTop: '5px',
    textAlign: 'center', // Ensure text itself is centered
    wordBreak: 'break-word',
    maxWidth: '120px', // Constrain width slightly more than button if needed
};

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
        if (isConfirmed) {
            onCancelActionCompleted(transferId);
        }
    }, [isConfirmed, onCancelActionCompleted, transferId]);

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
    let currentButtonStyle = formButtonStyle;
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
        currentButtonStyle = { ...formButtonStyle, background: '#4CAF50' };
    } else if (simulateData?.request) {
        buttonText = "Cancel";
        isDisabled = false;
    }

    const finalButtonStyle = isDisabled ? disabledButtonStyle : currentButtonStyle;

    return (
        <div style={rootContainerStyle}> {/* Apply the new root container style here */}
            <button
                onClick={handleCancel}
                style={finalButtonStyle}
                disabled={isDisabled}
            >
                {buttonText}
            </button>
            {errorMessage && (
                <p style={errorMessageStyle}> {/* Apply the new error message style here */}
                    {errorMessage.includes("User rejected") ? "User rejected transaction." : `Error: ${errorMessage}`}
                </p>
            )}
        </div>
    );
};

export default CancelTransferButton;
// src/components/CreateTransfers/CreateTransfers.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useAccount,
    useReadContract,
    useSimulateContract
} from 'wagmi';
import { parseUnits, isAddress, formatUnits } from 'viem';
import type { Abi, Address } from 'viem';
import { useQueryClient } from '@tanstack/react-query';

// Import Font Awesome icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';

// Import your ABIs
import abiPstWrapper from '../../utils/abis/abi_pst.json';
import erc20AbiJson from '../../utils/abis/abi_erc20.json';

// Import your pre-approved tokens list
import { ALL_NETWORK_TOKENS } from '../../utils/constants/tokenList';

// Import the new PendingTransfers component
// Ensure this path is correct based on your file structure, e.g., if you moved it to 'components/PendingTransfers/PendingTransfers.tsx'
import PendingTransfers from '../PendingTransfers/PendingTransfers';

// Import the CSS Module
import styles from './CreateTransfers.module.css';

// Define a custom error interface to safely access 'cause'
interface CustomError extends Error {
    cause?: unknown; // 'cause' can be of any type
    shortMessage?: string; // wagmi/viem often adds this
    details?: string; // another common detail field
    data?: { // sometimes viem errors include a 'data' field
        message?: string;
        data?: unknown; // nested data
    };
}

// Type assertions for ABIs
const PST_CONTRACT_ABI = abiPstWrapper as unknown as Abi;
const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

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

// --- Frontend Calculation for Total Transfer Cost (Replicating Solidity Logic) ---
interface TransferFee {
    lvlOne: bigint;
    lvlTwo: bigint;
    lvlThree: bigint;
}

function selectTransferFee(
    _amount: bigint,
    s_limitLevelOne: bigint,
    s_limitLevelTwo: bigint,
    transferFees: TransferFee
): bigint {
    if (_amount <= s_limitLevelOne) {
        return transferFees.lvlOne;
    } else if (_amount <= s_limitLevelTwo) {
        return transferFees.lvlTwo;
    } else {
        return transferFees.lvlThree;
    }
}

function calculateTotalTransferCostFrontend(
    amount: bigint,
    s_limitLevelOne: bigint,
    s_limitLevelTwo: bigint,
    s_feeScalingFactor: bigint,
    transferFees: TransferFee
): { totalTransferCost: bigint; transferFeeCost: bigint } {
    const _transferFee = selectTransferFee(amount, s_limitLevelOne, s_limitLevelTwo, transferFees);
    let _transferFeeCost: bigint;
    if (s_feeScalingFactor === 0n) {
        _transferFeeCost = 0n;
    } else {
        _transferFeeCost = (amount * _transferFee) / s_feeScalingFactor;
    }
    const _totalTransferCost = amount + _transferFeeCost;

    return { totalTransferCost: _totalTransferCost, transferFeeCost: _transferFeeCost };
}

// --- UTILITY FUNCTIONS ---
const truncateAddress = (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

const copyToClipboard = async (text: string, setCopiedAddress: React.Dispatch<React.SetStateAction<string | null>>) => {
    try {
        await navigator.clipboard.writeText(text);
        setCopiedAddress(text);
        setTimeout(() => {
            setCopiedAddress(null);
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy address. Please try again.');
    }
};

// --- MAIN REACT COMPONENT STARTS HERE ---
const CreateTransfer: React.FC = () => {
    const { address: userAddress, chain, isConnected } = useAccount();
    const queryClient = useQueryClient(); // Initialize queryClient

    const [recipientAddress, setRecipientAddress] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [showTokenDropdown, setShowTokenDropdown] = useState<boolean>(false);
    const [copiedAddressGlobal, setCopiedAddressGlobal] = useState<string | null>(null); // Renamed to avoid conflict
    // Removed: const [refetchPendingTransfers, setRefetchPendingTransfers] = useState<boolean>(false); // State to trigger refetch in child

    const tokenDropdownRef = useRef<HTMLDivElement>(null);

    const [currentNetworkTokens, setCurrentNetworkTokens] = useState(
        ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id)?.tokens || []
    );
    const [selectedToken, setSelectedToken] = useState<typeof currentNetworkTokens[0] | undefined>(
        currentNetworkTokens[0]
    );

    const pstContractAddress = getPSTContractAddress(chain?.id);

    // Fetch s_cancelCooldownPeriod - kept here to pass to PendingTransfers
    const {
        data: cancelCooldownPeriod,
        isLoading: isLoadingCancelCooldown,
        error: cancelCooldownError
    } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 's_cancelCooldownPeriod',
        chainId: chain?.id,
        query: {
            enabled: isConnected && !!pstContractAddress,
            staleTime: Infinity, // This value is unlikely to change
        },
    }) as { data?: bigint; isLoading: boolean; error?: Error };

    // Frontend calculated values for simulation arguments
    const parsedAmountForCalculation = amount && selectedToken ? parseUnits(amount, selectedToken.decimals) : 0n;

    const { data: sLimitLevelOne = 0n } = useReadContract({
        address: pstContractAddress, abi: PST_CONTRACT_ABI, functionName: 's_limitLevelOne', chainId: chain?.id, query: { enabled: !!pstContractAddress }
    }) as { data?: bigint };
    const { data: sLimitLevelTwo = 0n } = useReadContract({
        address: pstContractAddress, abi: PST_CONTRACT_ABI, functionName: 's_limitLevelTwo', chainId: chain?.id, query: { enabled: !!pstContractAddress }
    }) as { data?: bigint };
    const { data: sFeeScalingFactor = 0n } = useReadContract({
        address: pstContractAddress, abi: PST_CONTRACT_ABI, functionName: 's_feeScalingFactor', chainId: chain?.id, query: { enabled: !!pstContractAddress }
    }) as { data?: bigint };

    const { data: contractTransferFees, isLoading: isLoadingTransferFees } = useReadContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'getTransferFees',
        chainId: chain?.id,
        query: { enabled: !!pstContractAddress }
    }) as { data?: { lvlOne: bigint, lvlTwo: bigint, lvlThree: bigint }; isLoading: boolean };

    const transferFees: TransferFee = {
        lvlOne: (contractTransferFees as any)?.lvlOne || 0n,
        lvlTwo: (contractTransferFees as any)?.lvlTwo || 0n,
        lvlThree: (contractTransferFees as any)?.lvlThree || 0n,
    };

    const { totalTransferCost, } =
        sLimitLevelOne > 0n &&
            sLimitLevelTwo > 0n &&
            sFeeScalingFactor > 0n &&
            transferFees.lvlOne >= 0n && transferFees.lvlTwo >= 0n && transferFees.lvlThree >= 0n &&
            selectedToken?.decimals !== undefined &&
            !isLoadingTransferFees
            ? calculateTotalTransferCostFrontend(
                parsedAmountForCalculation,
                sLimitLevelOne,
                sLimitLevelTwo,
                sFeeScalingFactor,
                transferFees
            )
            : { totalTransferCost: 0n, };

    const formattedTotalTransferCost = selectedToken ? formatUnits(totalTransferCost, selectedToken.decimals) : '0';

    const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
        address: selectedToken && !selectedToken.isNative ? selectedToken.address : undefined,
        abi: ERC20_CONTRACT_ABI,
        functionName: 'allowance',
        args: userAddress && pstContractAddress ? [userAddress, pstContractAddress] : undefined,
        chainId: chain?.id,
        query: {
            enabled: !!userAddress && !!selectedToken && !selectedToken.isNative && !!pstContractAddress,
            staleTime: 5000,
        },
    }) as { data?: bigint; refetch: () => void };


    const allowance: bigint = (rawAllowance as bigint | undefined) || 0n;
    const isAllowanceSufficient = selectedToken?.isNative || allowance >= totalTransferCost;

    // Define conditions for enabling useSimulateContract query
    const isContractParamsLoaded =
        sLimitLevelOne > 0n &&
        sLimitLevelTwo > 0n &&
        sFeeScalingFactor > 0n &&
        transferFees.lvlOne >= 0n && transferFees.lvlTwo >= 0n && transferFees.lvlThree >= 0n &&
        !isLoadingTransferFees;

    // Basic validation of form inputs
    const isBasicInputValid =
        !!selectedToken &&
        isAddress(recipientAddress) &&
        parseFloat(amount) > 0 &&
        amount !== '' &&
        !!password &&
        password.length >= 7 && // This condition requires at least 7 characters
        isConnected &&
        !!chain &&
        !!pstContractAddress;


    // --- useSimulateContract for pre-flight error checking ---
    const { data: simulateData, error: simulateError, isLoading: isSimulating } = useSimulateContract({
        address: pstContractAddress,
        abi: PST_CONTRACT_ABI,
        functionName: 'createTransfer',
        // Provide robust dummy values if actual inputs are not yet valid
        args: [
            isAddress(recipientAddress) ? recipientAddress : '0x0000000000000000000000000000000000000001',
            selectedToken?.address || '0x0000000000000000000000000000000000000001',
            parsedAmountForCalculation, // Will be 0n if amount is empty/invalid
            password.length > 0 ? password : 'dummy_password',
        ],
        chainId: chain?.id,
        value: selectedToken?.isNative ? totalTransferCost : undefined,
        query: {
            // Enable simulation only when basic form inputs and contract parameters are ready
            enabled: isBasicInputValid && isContractParamsLoaded,
            staleTime: 5000,
            refetchOnWindowFocus: false,
            refetchInterval: false,
        }
    });

    const { writeContract: writePSTContract, data: pstHash, isPending: isPSTWritePending, error: pstWriteError } = useWriteContract();
    const { writeContract: writeERC20Contract, data: erc20Hash, isPending: isERC20WritePending, error: erc20WriteError } = useWriteContract();

    const transactionHashToWatch = pstHash || erc20Hash;

    const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
        hash: transactionHashToWatch,
        query: {
            enabled: !!transactionHashToWatch,
        }
    });

    // isPending now tracks only actual transaction signing/confirmation, not simulation
    const isPending = isPSTWritePending || isERC20WritePending;


    useEffect(() => {
        if (chain) {
            const tokensForChain = ALL_NETWORK_TOKENS.find(net => net.chainId === chain.id)?.tokens || [];
            setCurrentNetworkTokens(tokensForChain);
            setSelectedToken(prevToken => {
                if (prevToken && tokensForChain.some(t => t.address === prevToken.address)) {
                    return prevToken;
                }
                return tokensForChain[0];
            });
        } else {
            setCurrentNetworkTokens([]);
            setSelectedToken(undefined);
        }
    }, [chain]);

    useEffect(() => {
        if (userAddress && selectedToken && pstContractAddress && !selectedToken.isNative) {
            refetchAllowance();
        }
    }, [userAddress, selectedToken, pstContractAddress, refetchAllowance, amount]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(event.target as Node)) {
                setShowTokenDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (isConfirmed) {
            // Reset fields
            setAmount('');
            setRecipientAddress('');
            setPassword('');

            console.log("--- CreateTransfers.tsx Invalidation Attempt (Broader) ---");
            console.log("Targeting address:", pstContractAddress);
            console.log("Targeting chainId:", chain?.id);

            // This single invalidate call will target ANY 'readContract' query
            // that is against this specific PST contract address on the current chain.
            // It's less precise on functionName/args, but much more resilient to subtle mismatches.
            queryClient.invalidateQueries({
                queryKey: ['readContract', {
                    address: pstContractAddress,
                    chainId: chain?.id,
                }],
                // 'all' refetch type ensures even inactive queries (if they temporarily unmount) are refetched
                // 'exact: false' is implied here as we're only providing partial key.
                // You can omit 'exact: true' or 'exact: false' when providing a partial key.
            });

            console.log("--- Broader Invalidation triggered in CreateTransfers.tsx ---");
        }
    }, [isConfirmed, queryClient, pstContractAddress, chain?.id]); // Note: PST_CONTRACT_ABI and userAddress are no longer needed as dependencies here for the broader invalidation

    // Memoize the callback passed to PendingTransfers to prevent unnecessary re-renders and loop
    const handleTransferActionCompletedInParent = useCallback((transferId: bigint) => {
        console.log(`[CreateTransfers] Action completed for ID: ${transferId} in child component. Cache invalidation handled by PendingTransfers.`);
        // No setState here to avoid triggering re-render loops in CreateTransfers
    }, []); // Empty dependency array because this callback doesn't depend on any changing state/props from CreateTransfers

    const handleTokenSelect = (token: typeof currentNetworkTokens[0]) => {
        setSelectedToken(token);
        setShowTokenDropdown(false);
    };

    const handleCopyAddress = useCallback((text: string) => {
        copyToClipboard(text, setCopiedAddressGlobal);
    }, []);


    const handleApprove = async () => {
        if (!isConnected || !userAddress || !selectedToken || selectedToken.isNative || !pstContractAddress || !amount) {
            alert('Please connect wallet, select an ERC-20 token, and enter an amount to approve.');
            return;
        }
        if (parseFloat(amount) <= 0) {
            alert('Amount to approve must be greater than zero.');
            return;
        }

        try {
            writeERC20Contract({
                address: selectedToken.address,
                abi: ERC20_CONTRACT_ABI,
                functionName: 'approve',
                args: [pstContractAddress, totalTransferCost],
                chainId: chain?.id,
            });
        } catch (e) {
            console.error("Error during approval setup:", e);
            alert(`Approval failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleTransfer = async () => {
        console.log("handleTransfer invoked."); // Debugging log
        if (!isConnected) {
            alert('Please connect your wallet to perform a transfer.');
            return;
        }
        if (!isBasicInputValid) {
            alert('Please fill all fields correctly, including password, and select a valid token and recipient address.');
            return;
        }
        if (!isContractParamsLoaded) {
            alert('Contract configuration (fee parameters) not fully loaded or invalid. Please wait or refresh.');
            return;
        }
        if (!selectedToken!.isNative && !isAllowanceSufficient) {
            alert(`Insufficient allowance for ${selectedToken!.symbol}. Please approve the PST contract for the total transfer cost first.`);
            return;
        }

        // IMPORTANT: Check for simulation errors or missing simulation data BEFORE sending the transaction
        if (simulateError) {
            alert(`Pre-flight check failed: ${getUserFriendlyErrorMessage(simulateError)}`);
            console.error("Simulation error caught before sending transaction:", simulateError);
            return;
        }

        const transferRequest = simulateData?.request;

        if (!transferRequest) {
            alert('Transaction simulation data not ready. Please ensure all inputs are valid and try again.');
            console.error("simulateData or simulateData.request is undefined/null.", { simulateData });
            return;
        }

        try {
            console.log("Calling writePSTContract..."); // Debugging log
            writePSTContract(transferRequest);

        } catch (e) {
            console.error("Error during transfer setup:", e);
            alert(`Transfer failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const getExplorerUrl = (txHash: Address | undefined) => {
        if (!txHash || !chain) return '#';
        switch (chain.id) {
            case 11155111: return `https://sepolia.etherscan.io/tx/${txHash}`;
            case 300: return `https://sepolia.explorer.zksync.io/tx/${txHash}`;
            default: return `#`;
        }
    };

    // Prioritize simulateError for immediate feedback, then write errors, then confirmation errors
    const displayError = simulateError || pstWriteError || erc20WriteError || confirmError;

    // Function to get a user-friendly error message
    const getUserFriendlyErrorMessage = (error: Error | null): string => {
        if (!error) return '';

        console.error("Error received by getUserFriendlyErrorMessage:", error);

        // Cast to CustomError interface for safer property access
        const customError = error as CustomError;

        let extractedMessage = customError.shortMessage || customError.message || String(error);

        // Regex to match custom Solidity errors like "Error: PST__CustomErrorName()"
        const customErrorPattern = /Error: ([A-Za-z0-9_]+\(\))(?:\s+\(.*\))?/; // Added non-capturing group for potential extra info

        // 1. Check in the main extracted message (shortMessage/message)
        let match = extractedMessage.match(customErrorPattern);
        if (match && match[1]) {
            const customErrorName = match[1];
            switch (customErrorName) {
                case "PST__CantSendToOwnAddress()":
                    return "Error: You cannot send tokens to your own address.";
                case "PST__AmountToSendShouldBeHigher()":
                    return "Error: The amount to send is too low. Please send a higher amount.";
                case "PST__PasswordNotProvided()":
                    return "Error: A password must be provided for the transfer.";
                case "PST__PasswordTooShort()":
                    return "Error: The password is too short. Please use a longer password (min 7 characters).";
                case "PST__CooldownPeriodElapsed()": // NEW: Handle CooldownPeriodElapsed
                    return "Error: The cancellation period for this transfer has elapsed.";
                default:
                    return `Contract Error: ${customErrorName}`;
            }
        }

        // 2. If not found in main message, search within the 'cause' property
        if (customError.cause && typeof customError.cause === 'object') {
            const causeAsAny = customError.cause as any; // Cast cause to any for deeper inspection

            // Check cause's message, reason, or data.message
            const causeMessages = [
                causeAsAny.shortMessage,
                causeAsAny.message,
                causeAsAny.reason, // specific to some viem errors
                causeAsAny.data?.message
            ].filter(Boolean) as string[]; // Filter out undefined/null and ensure strings

            for (const msg of causeMessages) {
                match = msg.match(customErrorPattern);
                if (match && match[1]) {
                    const customErrorName = match[1];
                    switch (customErrorName) {
                        case "PST__CantSendToOwnAddress()":
                            return "Error: You cannot send tokens to your own address.";
                        case "PST__AmountToSendShouldBeHigher()":
                            return "Error: The amount to send is too low. Please send a higher amount.";
                        case "PST__PasswordNotProvided()":
                            return "Error: A password must be provided for the transfer.";
                        case "PST__PasswordTooShort()":
                            return "Error: The password is too short. Please use a longer password (min 7 characters).";
                        default:
                            return `Contract Error: ${customErrorName}`;
                    }
                }
            }
        }

        // Fallback for common wagmi/viem/EVM errors (these are less specific than custom reverts)
        if (extractedMessage.includes("User rejected the request")) {
            return "Transaction rejected by user.";
        }
        if (extractedMessage.includes("insufficient funds for gas")) {
            return "Error: Insufficient funds for gas. Please add more native tokens (e.g., ETH) to your wallet.";
        }
        if (extractedMessage.includes("ChainMismatchError")) {
            return "Wallet/Network Mismatch: Please switch your wallet to the correct network.";
        }
        if (extractedMessage.includes("nonce has already been used")) {
            return "Transaction failed: Nonce already used. Please try again or check your wallet's transaction queue.";
        }
        if (extractedMessage.includes("Execution reverted with custom error")) {
            const genericMatch = extractedMessage.match(/Execution reverted with custom error '([^']+)'/);
            if (genericMatch && genericMatch[1]) {
                return `Contract Error: ${genericMatch[1]}`;
            }
            return "Contract Error: Unknown custom error.";
        }
        if (extractedMessage.includes("revert")) {
            const revertReasonMatch = extractedMessage.match(/revert\s+(.*)/i);
            if (revertReasonMatch && revertReasonMatch[1]) {
                return `Transaction Reverted: ${revertReasonMatch[1].trim()}`;
            }
            return "Transaction reverted for an unknown reason.";
        }

        // Final fallback for any other errors not specifically caught
        return `Transaction Error: ${extractedMessage}`;
    };

    const displayErrorMessage = getUserFriendlyErrorMessage(displayError);

    // Helper variable for simulation readiness
    // `!simulateError` handles both `null` (no error) and `undefined` (not yet run)
    const isSimulationReadyForTransfer = Boolean(isBasicInputValid && isContractParamsLoaded && !isSimulating && !simulateError && simulateData?.request);

    // New computed variable for button disabled state
    const isTransferButtonDisabled =
        !isBasicInputValid || // If basic inputs aren't met, disable immediately
        !isContractParamsLoaded || // If contract params aren't loaded, disable
        isPending || // wagmi is writing or confirming (covers isPSTWritePending, isERC20WritePending)
        isConfirming || // waiting for receipt
        simulateError !== null || // If simulateError is NOT null (meaning there is an error object), keep disabled
        (!selectedToken?.isNative && !isAllowanceSufficient) || // For ERC20, if allowance is not sufficient, disable.
        !isSimulationReadyForTransfer; // The most important check for enabling the button to send the actual transaction

    return (
        <>
            <div className={styles.CreateTransferCard}>
                <h2 className={styles.cardTitle}>Create Transfer</h2>

                {isConnected && chain ? (
                    <p className={styles.connectedNetwork}>
                        Connected to: <strong>{chain.name}</strong> {/*(Chain ID: {chain.id})*/}
                    </p>
                ) : (
                    <p className={styles.disconnectedNetwork}>Please connect your wallet.</p>
                )}

                {/* Input/Dropdown Group */}
                <div className={styles.inputGroup}>
                    <div className={styles.amountAndCostWrapper}>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                            min="0"
                            step="any"
                            className={styles.amountInput}
                        />
                        <p className={styles.totalCost}>
                            Total transfer cost:{" "}
                            {selectedToken
                                ? `${formattedTotalTransferCost} ${selectedToken.symbol}`
                                : `0.00 N/A`}
                        </p>
                    </div>

                    <div className={styles.tokenSelectContainer} ref={tokenDropdownRef}>
                        <button
                            onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                            className={styles.tokenSelectButton}
                            disabled={!currentNetworkTokens.length}
                        >
                            {selectedToken ? (
                                <div className={styles.tokenButtonContent}>
                                    {selectedToken.logoURI && <img src={selectedToken.logoURI} alt={selectedToken.symbol} className={styles.tokenLogo} />}
                                    <span className={styles.tokenSymbol}>{selectedToken.symbol}</span>
                                    <span className={styles.dropdownArrow}>▼</span>
                                </div>
                            ) : (
                                'Select Token ▼'
                            )}
                        </button>

                        {showTokenDropdown && currentNetworkTokens.length > 0 && (
                            <div className={styles.tokenDropdownMenu}>
                                {currentNetworkTokens.map((token) => (
                                    <div
                                        key={token.address}
                                        onClick={() => handleTokenSelect(token)}
                                        className={styles.tokenDropdownItem}
                                    >
                                        <div className={styles.tokenButtonContent}> {/* Re-using tokenButtonContent for flex layout here */}
                                            {token.logoURI && <img src={token.logoURI} alt={token.symbol} className={styles.tokenLogo} />}
                                            <span className={styles.tokenSymbol}>{token.symbol}</span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}> {/* Inline style for this specific flex container */}
                                            {/* <span className={styles.tokenAddress}>
                                                {token.address ? truncateAddress(token.address) : ''}
                                            </span> */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCopyAddress(token.address);
                                                }}
                                                className={styles.copyButton}
                                            >
                                                {copiedAddressGlobal === token.address ? 'Copied!' : <FontAwesomeIcon icon={faCopy} />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.fieldContainer}>
                    <label htmlFor="recipient-address" className={styles.label}>Recipient Address:</label>
                    <input
                        id="recipient-address"
                        type="text"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="0x..."
                        className={styles.inputField}
                    />
                </div>

                <div className={styles.fieldContainer}>
                    <label htmlFor="password" className={styles.label}>Password:</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password [min 7 characters]"
                        className={styles.inputField}
                    />
                </div>

                {selectedToken && !selectedToken.isNative && isConnected && amount && parseFloat(amount) > 0 && (
                    <div className={styles.approvalSection}>
                        <p className={styles.approvalText}>
                            Current Allowance to PST Contract: {formatUnits(allowance, selectedToken.decimals)} {selectedToken.symbol}
                        </p>
                        {!isAllowanceSufficient && (
                            <p className={`${styles.approvalText} ${styles.warning}`}>
                                Approval needed: You need to approve at least {formattedTotalTransferCost} {selectedToken.symbol} for the PST Contract.
                            </p>
                        )}
                        <button
                            onClick={handleApprove}
                            disabled={isERC20WritePending || isConfirming || !isConnected || isAllowanceSufficient}
                            className={`${styles.formButton} ${isAllowanceSufficient ? styles.approved : ''}`}
                            style={{ marginTop: '10px' }} // Keep this inline style for specific spacing if desired
                        >
                            {isERC20WritePending ? 'Approving...' : isAllowanceSufficient ? 'Approved!' : 'Approve PST Contract'}
                        </button>
                    </div>
                )}

                <button
                    onClick={handleTransfer}
                    disabled={isTransferButtonDisabled}
                    className={styles.formButton}
                >
                    {isPending ? 'Confirming...' : isConfirming ? 'Transferring...' : 'Create Transfer'}
                </button>

                {/* Transaction Status and Errors */}
                {transactionHashToWatch ? (
                    <p className={styles.transactionStatus}>Transaction Hash: <a href={getExplorerUrl(transactionHashToWatch)} target="_blank" rel="noopener noreferrer" className={styles.link}>{truncateAddress(transactionHashToWatch)}</a></p>
                ) : null}
                {isConfirming && <p className={styles.transactionStatus}>Waiting for confirmation...</p>}
                {isConfirmed && <p className={`${styles.transactionStatus} ${styles.success}`}>Transfer confirmed!</p>}
                {displayError && <p className={`${styles.transactionStatus} ${styles.error}`}>{displayErrorMessage}</p>}
            </div>

            {/* Render the PendingTransfers component */}
            <PendingTransfers
                pstContractAddress={pstContractAddress}
                // Removed refetchTrigger prop
                type="sent"
                onTransferActionCompleted={handleTransferActionCompletedInParent} //* Now using the memoized callback */}
                componentTitle="Your Sent Pending Transfers"
                cancelCooldownPeriod={cancelCooldownPeriod}
                isLoadingCancelCooldown={isLoadingCancelCooldown}
                cancelCooldownError={cancelCooldownError}
            />
        </>
    );
};

export default CreateTransfer;
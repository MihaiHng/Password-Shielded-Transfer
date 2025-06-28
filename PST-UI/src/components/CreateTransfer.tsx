// src/components/CreateTransfer.tsx

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
import type { SimulateContractReturnType } from 'wagmi/actions';

// Import your ABIs
import abiPstWrapper from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

// Import your pre-approved tokens list
import { ALL_NETWORK_TOKENS } from '../lib/constants/tokenList';

// Import the new PendingTransfers component
import PendingTransfers from './PendingTransfers';

// Import React's CSSProperties type
import type { CSSProperties } from 'react';

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

// --- ALL STYLE DEFINITIONS GO HERE (BEFORE THE COMPONENT) ---
const formButtonStyle: CSSProperties = {
    width: '100%',
    padding: '16px 20px',
    borderRadius: '20px',
    border: 'none',
    background: 'linear-gradient(to right, #ff007a, #9900ff)',
    color: 'white',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s ease',
    marginTop: '20px',
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.2)',
};

const disabledButtonStyle: CSSProperties = {
    ...formButtonStyle,
    background: '#E0E0E0',
    cursor: 'not-allowed',
    boxShadow: 'none',
};

const uniswapCardStyle: CSSProperties = {
    background: '#1b1b1b',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '480px',
    margin: '40px auto',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
};

const cardTitleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#fff',
};

const connectedNetworkStyle: CSSProperties = {
    fontSize: '14px',
    color: '#aaa',
    textAlign: 'center',
    marginBottom: '20px',
};

const disconnectedNetworkStyle: CSSProperties = {
    ...connectedNetworkStyle,
    color: 'red',
};

const inputGroupStyle: CSSProperties = {
    background: '#2c2c2c',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
};

const amountAndCostWrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
};

const amountInputStyle: CSSProperties = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '48px',
    fontWeight: 'bold',
    width: '100%',
    padding: '0',
    WebkitAppearance: 'none',
    MozAppearance: 'textfield',
    appearance: 'none',
};

const totalCostStyle: CSSProperties = {
    fontSize: '14px',
    color: '#aaa',
    marginTop: '8px',
    textAlign: 'left',
    width: '100%',
};

const tokenSelectContainerStyle: CSSProperties = {
    position: 'absolute',
    top: '16px',
    right: '16px',
    zIndex: 10,
};

const tokenSelectButtonStyle: CSSProperties = {
    background: 'rgba(50, 50, 50, 0.7)',
    borderRadius: '16px',
    padding: '8px 12px',
    border: 'none',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background 0.2s ease',
};

const tokenButtonContentStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const tokenLogoStyle: CSSProperties = {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
};

const tokenSymbolStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 'bold',
};

const dropdownArrowStyle: CSSProperties = {
    marginLeft: '4px',
    fontSize: '12px',
    transform: 'translateY(-1px)',
};

const tokenDropdownMenuStyle: CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: '0',
    background: '#2c2c2c',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    maxHeight: '200px',
    overflowY: 'auto',
    zIndex: 100,
    minWidth: '240px',
};

const tokenDropdownItemStyle: CSSProperties = {
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    cursor: 'pointer',
};

const tokenAddressStyle: CSSProperties = {
    fontSize: '12px',
    color: '#888',
    fontFamily: 'monospace',
};

const copyButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
    borderRadius: '4px',
    marginLeft: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
};

const fieldContainerStyle: CSSProperties = {
    marginBottom: '20px',
    background: '#2c2c2c',
    borderRadius: '16px',
    padding: '16px',
};

const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '14px',
    color: '#aaa',
    marginBottom: '8px',
};

const inputFieldStyle: CSSProperties = {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
};

const approvalSectionStyle: CSSProperties = {
    background: 'rgba(0, 123, 255, 0.1)',
    border: '1px solid #007bff',
    borderRadius: '16px',
    padding: '16px',
    marginTop: '20px',
    marginBottom: '20px',
    textAlign: 'center',
};

const approvalTextStyle: CSSProperties = {
    fontSize: '14px',
    color: '#ccc',
    marginBottom: '10px',
};

const transactionStatusStyle: CSSProperties = {
    fontSize: '12px',
    color: '#ccc',
    marginTop: '15px',
    textAlign: 'center',
};

const linkStyle: CSSProperties = {
    color: '#9900ff',
    textDecoration: 'none',
};

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

    const [recipientAddress, setRecipientAddress] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [showTokenDropdown, setShowTokenDropdown] = useState<boolean>(false);
    const [copiedAddressGlobal, setCopiedAddressGlobal] = useState<string | null>(null); // Renamed to avoid conflict
    const [refetchPendingTransfers, setRefetchPendingTransfers] = useState<boolean>(false); // State to trigger refetch in child

    const tokenDropdownRef = useRef<HTMLDivElement>(null);

    const [currentNetworkTokens, setCurrentNetworkTokens] = useState(
        ALL_NETWORK_TOKENS.find(net => net.chainId === chain?.id)?.tokens || []
    );
    const [selectedToken, setSelectedToken] = useState<typeof currentNetworkTokens[0] | undefined>(
        currentNetworkTokens[0]
    );

    const pstContractAddress = getPSTContractAddress(chain?.id);

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
    });

    const transferFees: TransferFee = {
        lvlOne: (contractTransferFees as any)?.lvlOne || 0n,
        lvlTwo: (contractTransferFees as any)?.lvlTwo || 0n,
        lvlThree: (contractTransferFees as any)?.lvlThree || 0n,
    };

    const { totalTransferCost, transferFeeCost } =
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
            : { totalTransferCost: 0n, transferFeeCost: 0n };

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
    });
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
            setPassword('');
            setRefetchPendingTransfers(prev => !prev); // Toggle to trigger refetch in child
        }
    }, [isConfirmed]);


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
                causeAsAny.data?.message // for nested data structures
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

    // Debugging logs:
    console.log("--- Button State Debug ---");
    console.log("isBasicInputValid:", isBasicInputValid);
    console.log("isContractParamsLoaded:", isContractParamsLoaded);
    console.log("isPending (includes isSimulating):", isPending); // isSimulating is now implicitly shown here
    console.log("isConfirming:", isConfirming);
    console.log("simulateError:", simulateError);
    console.log("simulateData:", simulateData);
    console.log("simulateData?.request:", simulateData?.request);
    console.log("isAllowanceSufficient (if ERC20):", isAllowanceSufficient);
    console.log("isSimulationReadyForTransfer:", isSimulationReadyForTransfer);
    console.log("isTransferButtonDisabled:", isTransferButtonDisabled);
    console.log("--------------------------");

    return (
        <>
            <div style={uniswapCardStyle}>
                <h2 style={cardTitleStyle}>Create Token Transfer</h2>

                {isConnected && chain ? (
                    <p style={connectedNetworkStyle}>
                        Connected to: <strong>{chain.name}</strong> (Chain ID: {chain.id})
                    </p>
                ) : (
                    <p style={disconnectedNetworkStyle}>Please connect your wallet.</p>
                )}

                {/* Input/Dropdown Group - Mimicking Uniswap's main input area */}
                <div style={inputGroupStyle}>
                    <div style={amountAndCostWrapperStyle}>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                            min="0"
                            step="any"
                            style={amountInputStyle}
                        />
                        <p style={totalCostStyle}>
                            Total transfer cost:{" "}
                            {selectedToken
                                ? `${formattedTotalTransferCost} ${selectedToken.symbol}`
                                : `0.00 N/A`}
                        </p>
                    </div>

                    <div style={tokenSelectContainerStyle} ref={tokenDropdownRef}>
                        <button
                            onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                            style={tokenSelectButtonStyle}
                            disabled={!currentNetworkTokens.length}
                        >
                            {selectedToken ? (
                                <div style={tokenButtonContentStyle}>
                                    {selectedToken.logoURI && <img src={selectedToken.logoURI} alt={selectedToken.symbol} style={tokenLogoStyle} />}
                                    <span style={tokenSymbolStyle}>{selectedToken.symbol}</span>
                                    <span style={dropdownArrowStyle}>▼</span>
                                </div>
                            ) : (
                                'Select Token ▼'
                            )}
                        </button>

                        {showTokenDropdown && currentNetworkTokens.length > 0 && (
                            <div style={tokenDropdownMenuStyle}>
                                {currentNetworkTokens.map((token) => (
                                    <div
                                        key={token.address}
                                        onClick={() => handleTokenSelect(token)}
                                        style={tokenDropdownItemStyle}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {token.logoURI && <img src={token.logoURI} alt={token.symbol} style={tokenLogoStyle} />}
                                            <span style={tokenSymbolStyle}>{token.symbol}</span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={tokenAddressStyle}>
                                                {token.address ? truncateAddress(token.address) : ''}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCopyAddress(token.address);
                                                }}
                                                style={copyButtonStyle}
                                            >
                                                {copiedAddressGlobal === token.address ? 'Copied!' : '📋'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div style={fieldContainerStyle}>
                    <label htmlFor="recipient-address" style={labelStyle}>Recipient Address:</label>
                    <input
                        id="recipient-address"
                        type="text"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="0x..."
                        style={inputFieldStyle}
                    />
                </div>

                <div style={fieldContainerStyle}>
                    <label htmlFor="password" style={labelStyle}>Password:</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password [min 7 characters]"
                        style={inputFieldStyle}
                    />
                </div>

                {selectedToken && !selectedToken.isNative && isConnected && amount && parseFloat(amount) > 0 && (
                    <div style={approvalSectionStyle}>
                        <p style={approvalTextStyle}>
                            Current Allowance to PST Contract: {formatUnits(allowance, selectedToken.decimals)} {selectedToken.symbol}
                        </p>
                        {!isAllowanceSufficient && (
                            <p style={{ ...approvalTextStyle, color: 'orange', fontWeight: 'bold' }}>
                                Approval needed: You need to approve at least {formattedTotalTransferCost} {selectedToken.symbol} for the PST Contract.
                            </p>
                        )}
                        <button
                            onClick={handleApprove}
                            disabled={isERC20WritePending || isConfirming || !isConnected || isAllowanceSufficient}
                            style={{
                                ...formButtonStyle,
                                marginTop: '10px',
                                background: isAllowanceSufficient ? '#4CAF50' : '#007bff',
                                boxShadow: isAllowanceSufficient ? 'none' : formButtonStyle.boxShadow,
                            }}
                        >
                            {isERC20WritePending ? 'Approving...' : isAllowanceSufficient ? 'Approved!' : 'Approve PST Contract'}
                        </button>
                    </div>
                )}

                <button
                    onClick={handleTransfer}
                    disabled={isTransferButtonDisabled}
                    style={isTransferButtonDisabled ? disabledButtonStyle : formButtonStyle}
                >
                    {/* Button text now reflects only actual transaction states */}
                    {isPending ? 'Confirming...' : isConfirming ? 'Transferring...' : 'Create Transfer'}
                </button>

                {/* Transaction Status and Errors */}
                {transactionHashToWatch ? (
                    <p style={transactionStatusStyle}>Transaction Hash: <a href={getExplorerUrl(transactionHashToWatch)} target="_blank" rel="noopener noreferrer" style={linkStyle}>{transactionHashToWatch}</a></p>
                ) : null}
                {isConfirming && <p style={transactionStatusStyle}>Waiting for confirmation...</p>}
                {isConfirmed && <p style={{ ...transactionStatusStyle, color: '#4CAF50' }}>Transfer confirmed!</p>}
                {displayError && <p style={{ ...transactionStatusStyle, color: 'red' }}>{displayErrorMessage}</p>}
            </div>

            {/* NEW: Render the PendingTransfers component */}
            <PendingTransfers
                pstContractAddress={pstContractAddress}
                refetchTrigger={refetchPendingTransfers}
                onTransferActionCompleted={() => setRefetchPendingTransfers(prev => !prev)} // Callback for when a transfer action (like cancel) is completed
            />
        </>
    );
};

export default CreateTransfer;

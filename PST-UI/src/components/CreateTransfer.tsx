// src/components/CreateTransfer.tsx

import React, { useState, useEffect } from 'react';
import {
    useAccount,
    useWriteContract,
    useReadContract,
    usePublicClient,
} from 'wagmi';
import { parseEther, isAddress, formatUnits } from 'viem';
import type { Abi } from 'viem';
import { sepolia, zksyncSepoliaTestnet } from '@reown/appkit/networks';

// IMPORT YOUR ABIs FROM .json files with their names
import abi_pst from '../lib/abis/abi_pst.json';
import erc20AbiJson from '../lib/abis/abi_erc20.json';

import { formButtonStyle } from '../styles/buttonStyles';

// Cast imported JSON to Abi type as a workaround for ts(1355)
const PST_CONTRACT_ABI = abi_pst as unknown as Abi;
const ERC20_CONTRACT_ABI = erc20AbiJson as unknown as Abi;

// IMPORTANT: Replace these with your actual deployed addresses!
// Make sure these are valid 0x addresses, not placeholders for production!
const PST_CONTRACT_ADDRESS_SEPOLIA = import.meta.env.VITE_PST_ETH_SEPOLIA_ADDRESS as `0x${string}`;
const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA = import.meta.env.VITE_PST_ZKSYNC_SEPOLIA_ADDRESS as `0x${string}`;

// Add a check to ensure they are defined, especially for production builds
if (!PST_CONTRACT_ADDRESS_SEPOLIA || !PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA) {
    console.error("Missing contract addresses in .env file! Please check VITE_PST_ETH_SEPOLIA_ADDRESS and VITE_PST_ZKSYNC_SEPOLIA_ADDRESS.");
    // In a production app, you might want to throw an error or render an error state here.
}


const CreateTransfer: React.FC = () => {
    const { address: walletAddress, chainId, isConnected } = useAccount();
    const publicClient = usePublicClient();

    const [receiver, setReceiver] = useState<string>('');
    const [tokenAddress, setTokenAddress] = useState<string>('0x0000000000000000000000000000000000000000');
    const [amount, setAmount] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [currentPstContractAddress, setCurrentPstContractAddress] = useState<`0x${string}` | undefined>(undefined);
    const [parsedAmount, setParsedAmount] = useState<bigint>(0n);

    const isEthTransfer = tokenAddress === '0x0000000000000000000000000000000000000000';

    // --- UI/Process States ---
    const [isProcessingApprovalAndTransfer, setIsProcessingApprovalAndTransfer] = useState(false);
    const [currentStatusMessage, setCurrentStatusMessage] = useState('');
    const [isCreateTransferConfirmedLocally, setIsCreateTransferConfirmedLocally] = useState(false);

    // --- Token Info States ---
    const [tokenDecimals, setTokenDecimals] = useState<number>(18);
    const [tokenSymbol, setTokenSymbol] = useState<string>('ETH');

    // --- Effect for Chain ID and PST Contract Address ---
    useEffect(() => {
        if (chainId) {
            if (chainId === sepolia.id && PST_CONTRACT_ADDRESS_SEPOLIA) {
                setCurrentPstContractAddress(PST_CONTRACT_ADDRESS_SEPOLIA);
            } else if (chainId === zksyncSepoliaTestnet.id && PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA) {
                setCurrentPstContractAddress(PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA);
            } else {
                setCurrentPstContractAddress(undefined);
            }
        }
    }, [chainId]);


    // --- Effect for Parsing Amount ---
    useEffect(() => {
        try {
            if (amount) {
                setParsedAmount(parseEther(amount));
            } else {
                setParsedAmount(0n);
            }
        } catch (e) {
            setParsedAmount(0n);
        }
    }, [amount]);


    // --- Read ERC20 Allowance ---
    const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
        abi: ERC20_CONTRACT_ABI,
        address: isEthTransfer ? undefined : (tokenAddress as `0x${string}`),
        functionName: 'allowance',
        args: [walletAddress!, currentPstContractAddress!],
        query: {
            enabled: isConnected && !isEthTransfer && !!walletAddress && !!currentPstContractAddress && isAddress(tokenAddress),
            refetchInterval: 4000,
        },
    });
    const currentAllowance = allowanceData as bigint | undefined;

    // --- Read Token Decimals ---
    const { data: decimalsData } = useReadContract({
        abi: ERC20_CONTRACT_ABI,
        address: isEthTransfer ? undefined : (tokenAddress as `0x${string}`),
        functionName: 'decimals',
        query: { enabled: isConnected && !isEthTransfer && isAddress(tokenAddress), staleTime: Infinity, },
    });
    const fetchedDecimals = decimalsData as number | undefined;

    // --- Read Token Symbol ---
    const { data: symbolData } = useReadContract({
        abi: ERC20_CONTRACT_ABI,
        address: isEthTransfer ? undefined : (tokenAddress as `0x${string}`),
        functionName: 'symbol',
        query: { enabled: isConnected && !isEthTransfer && isAddress(tokenAddress), staleTime: Infinity, },
    });
    const fetchedSymbol = symbolData as string | undefined;


    useEffect(() => {
        if (fetchedDecimals !== undefined) setTokenDecimals(Number(fetchedDecimals));
    }, [fetchedDecimals]);

    useEffect(() => {
        if (fetchedSymbol) {
            setTokenSymbol(fetchedSymbol);
        } else if (isEthTransfer) {
            setTokenSymbol('ETH');
        } else {
            setTokenSymbol('TOKEN');
        }
    }, [fetchedSymbol, isEthTransfer]);


    // --- Write Contracts Hooks ---
    const {
        data: createTransferHashRaw,
        writeContract: sendCreateTransferTx,
        isPending: isCreateTransferCallPending, // <-- RE-INTRODUCED
        error: createTransferCallError,
    } = useWriteContract();

    const {
        writeContract: sendApproveTx,
        isPending: isApproveCallPending, // <-- RE-INTRODUCED
        error: approveCallError,
    } = useWriteContract();


    // --- Main Submit Handler: Orchestrates Approval and Transfer ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Reset states for a new transaction attempt
        setIsProcessingApprovalAndTransfer(true);
        setCurrentStatusMessage('Initializing transaction...');
        setIsCreateTransferConfirmedLocally(false);

        // Initial validation checks
        if (!isConnected || !walletAddress || !currentPstContractAddress) {
            setCurrentStatusMessage('Please connect your wallet and ensure you are on a supported network.');
            setIsProcessingApprovalAndTransfer(false);
            return;
        }
        if (!publicClient) {
            setCurrentStatusMessage('Blockchain client not available. Please try again.');
            setIsProcessingApprovalAndTransfer(false);
            return;
        }
        if (!isAddress(receiver)) { setCurrentStatusMessage('Invalid receiver address.'); setIsProcessingApprovalAndTransfer(false); return; }
        if (!parsedAmount || parsedAmount === 0n) { setCurrentStatusMessage('Invalid amount. Please enter a number greater than zero.'); setIsProcessingApprovalAndTransfer(false); return; }
        if (!password) { setCurrentStatusMessage('Password cannot be empty.'); setIsProcessingApprovalAndTransfer(false); return; }


        try {
            // --- Step 1: ERC20 Approval (if needed) ---
            if (!isEthTransfer) {
                if (!isAddress(tokenAddress)) { throw new Error('Invalid token address.'); }

                if (currentAllowance === undefined) {
                    setCurrentStatusMessage('Fetching token allowance... please wait.');
                    throw new Error("Could not fetch token allowance data. Please check token address and network or try again.");
                }

                if (currentAllowance < parsedAmount) {
                    setCurrentStatusMessage(`Awaiting wallet confirmation for ${tokenSymbol} approval... (1 of 2)`);

                    const approveTxHash = (await (sendApproveTx as any)({
                        address: tokenAddress as `0x${string}`,
                        abi: ERC20_CONTRACT_ABI,
                        functionName: 'approve',
                        args: [currentPstContractAddress, parsedAmount],
                    })) as `0x${string}` | undefined;

                    if (!approveTxHash) {
                        throw new Error('Approval transaction rejected or failed by wallet.');
                    }

                    setCurrentStatusMessage('Approval transaction sent. Waiting for confirmation on chain...');
                    const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

                    if (approvalReceipt.status !== 'success') {
                        throw new Error('Approval transaction failed on chain.');
                    }
                    setCurrentStatusMessage('Approval confirmed! Awaiting wallet confirmation for transfer... (2 of 2)');
                    refetchAllowance(); // Refetch allowance after successful approval
                }
            }

            // --- Step 2: Create Transfer ---
            const args = [
                receiver as `0x${string}`,
                tokenAddress as `0x${string}`,
                parsedAmount,
                password,
            ];

            const valueToSend: bigint | undefined = isEthTransfer ? parsedAmount : undefined;

            const createTxHash = (await (sendCreateTransferTx as any)({
                address: currentPstContractAddress,
                abi: PST_CONTRACT_ABI,
                functionName: 'createTransfer',
                args: args,
                value: valueToSend,
            })) as `0x${string}` | undefined;

            if (!createTxHash) {
                throw new Error('Transfer transaction rejected or failed by wallet.');
            }

            setCurrentStatusMessage('Transfer transaction sent. Waiting for confirmation on chain...');

            // <-- ADDED: AWAIT FOR THE TRANSFER TRANSACTION RECEIPT HERE!
            const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash });

            if (transferReceipt.status !== 'success') {
                throw new Error('Transfer transaction failed on chain.');
            }

            // Transaction confirmed successfully!
            setCurrentStatusMessage('Transfer Created Successfully!');
            setIsCreateTransferConfirmedLocally(true);
            setIsProcessingApprovalAndTransfer(false); // <-- Reset processing state on full success

        } catch (err) {
            console.error("Error during transaction flow:", err);
            let errorMessage = 'An unexpected error occurred.';
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (createTransferCallError) {
                errorMessage = createTransferCallError.message;
            } else if (approveCallError) {
                errorMessage = approveCallError.message;
            }
            setCurrentStatusMessage(`Error: ${errorMessage}`);
            setIsProcessingApprovalAndTransfer(false); // Reset on error
            setIsCreateTransferConfirmedLocally(false); // Ensure it's false on error
        }
    };

    const createTransferHash: `0x${string}` | undefined = createTransferHashRaw;


    const currentChainName = chainId === sepolia.id ? 'Sepolia ETH' : (chainId === zksyncSepoliaTestnet.id ? 'zkSync Sepolia' : 'Unsupported Network');

    const isCreateTransferButtonDisabled =
        isProcessingApprovalAndTransfer || // General state for initial confirmations/processing
        isCreateTransferCallPending ||   // Wagmi flag: transfer transaction is sent, pending on-chain
        isApproveCallPending ||        // Wagmi flag: approval transaction is sent, pending on-chain
        !isConnected ||
        !walletAddress ||
        !currentPstContractAddress ||
        !parsedAmount || parsedAmount === 0n ||
        !isAddress(receiver) ||
        !password ||
        (isEthTransfer ? false : (currentAllowance === undefined));


    const inputStyle: React.CSSProperties = {
        padding: '10px', margin: '10px 0', borderRadius: '4px',
        border: '1px solid #555', backgroundColor: '#333',
        color: '#eee', width: '300px',
    };

    const formStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '10px', backgroundColor: '#282828', padding: '30px',
        borderRadius: '10px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
    };

    const labelStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        width: '300px', color: '#ccc',
    };


    return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2>Create New Transfer</h2>

            {!isConnected && <p>Please connect your wallet to send a transfer.</p>}
            {isConnected && (
                <>
                    <p>Connected to: {currentChainName}</p>
                    {!currentPstContractAddress && (
                        <p style={{ color: '#FF6347', marginBottom: '20px' }}>
                            PST contract not deployed on {currentChainName}. Please connect to a supported network through your wallet or wallet connect button.
                        </p>
                    )}

                    {currentPstContractAddress && (
                        <form onSubmit={handleSubmit} style={formStyle}>
                            <label style={labelStyle}>
                                Receiver Address:
                                <input
                                    type="text"
                                    value={receiver}
                                    onChange={(e) => setReceiver(e.target.value)}
                                    style={inputStyle}
                                    required
                                />
                            </label>
                            <label style={labelStyle}>
                                Token Address (0x0 for ETH):
                                <input
                                    type="text"
                                    value={tokenAddress}
                                    onChange={(e) => setTokenAddress(e.target.value)}
                                    style={inputStyle}
                                    required
                                />
                            </label>
                            <label style={labelStyle}>
                                Amount (in units of {tokenSymbol}):
                                <input
                                    type="text"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    style={inputStyle}
                                    required
                                />
                            </label>
                            <label style={labelStyle}>
                                Password:
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={inputStyle}
                                    required
                                />
                            </label>

                            {!isEthTransfer && isAddress(tokenAddress) && walletAddress && currentPstContractAddress && (
                                <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#aaa' }}>
                                    {currentAllowance !== undefined && (
                                        <p>
                                            Current Allowance for PST: {formatUnits(currentAllowance, tokenDecimals)} {tokenSymbol}
                                        </p>
                                    )}
                                    {parsedAmount > 0n && currentAllowance !== undefined && currentAllowance < parsedAmount && (
                                        <p style={{ color: '#ffcc00' }}>
                                            Insufficient allowance. Approval will be requested automatically.
                                        </p>
                                    )}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isCreateTransferButtonDisabled}
                                style={{
                                    ...formButtonStyle,
                                    backgroundColor: '#4CAF50',
                                    color: '#fff',
                                    opacity: isCreateTransferButtonDisabled ? 0.7 : 1,
                                }}
                            >
                                {isProcessingApprovalAndTransfer || isCreateTransferCallPending || isApproveCallPending
                                    ? currentStatusMessage // Show detailed message during processing/pending
                                    : (isCreateTransferConfirmedLocally
                                        ? 'Transfer Confirmed!' // Show success message
                                        : 'Create Transfer' // Default button text
                                    )}
                            </button>

                            {/* Removed redundant status message display here as button text now handles it */}
                            {/* {isProcessingApprovalAndTransfer && !isCreateTransferConfirmedLocally && (
                                <p style={{ color: '#00BFFF', marginTop: '10px' }}>
                                    {currentStatusMessage}
                                </p>
                            )} */}

                            {createTransferHash && (
                                <p style={{ fontSize: '0.9em', marginTop: '10px' }}>
                                    Transfer Hash: <a
                                        href={chainId === sepolia.id
                                            ? `https://sepolia.etherscan.io/tx/${createTransferHash}`
                                            : `https://sepolia.explorer.zksync.io/tx/${createTransferHash}`
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#88f' }}
                                    >
                                        {createTransferHash.substring(0, 10)}...{createTransferHash.substring(createTransferHash.length - 10)}
                                    </a>
                                </p>
                            )}
                            {isCreateTransferConfirmedLocally && <p style={{ color: 'lightgreen' }}>Transfer Created Successfully!</p>}
                            {createTransferCallError && <p style={{ color: 'red' }}>Call Error: {createTransferCallError.message}</p>}
                            {approveCallError && <p style={{ color: 'red' }}>Approval Call Error: {approveCallError.message}</p>}


                            <p style={{ marginTop: '20px', fontSize: '0.9em', color: '#999' }}>
                                * Note: For ERC20 transfers, if insufficient allowance is found, an approval transaction will be prompted automatically before the transfer.
                            </p>
                        </form>
                    )}
                </>
            )}
        </div>
    );
};

export default CreateTransfer;
// src/components/SendTransfer.tsx
import React, { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, parseUnits, isAddress } from 'viem';
import { sepolia, zksyncSepoliaTestnet } from '@reown/appkit/networks'; // Make sure this import is correct
import { appKit } from '../lib/appkit'; // Import appKit instance for switchNetwork
import abi from '../../public/abi/PST.json'; // Your PST contract ABI

// Define your deployed contract addresses for each network
// IMPORTANT: Replace these with your actual deployed addresses!
const PST_CONTRACT_ADDRESS_SEPOLIA = '0xYourPSTContractAddressOnSepoliaETH'; // Example: 0x123...
const PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA = '0xYourPSTContractAddressOnzksyncSepoliaTestnet'; // Example: 0x456...

const SendTransfer: React.FC = () => {
    const { address: walletAddress, chainId, isConnected } = useAccount();
    const { switchChain } = useSwitchChain();

    const [receiver, setReceiver] = useState<string>('');
    const [tokenAddress, setTokenAddress] = useState<string>('0x0000000000000000000000000000000000000000'); // Default to ETH (address(0))
    const [amount, setAmount] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [currentPstContractAddress, setCurrentPstContractAddress] = useState<`0x${string}` | undefined>(undefined);

    React.useEffect(() => {
        if (chainId) {
            if (chainId === sepolia.id) {
                setCurrentPstContractAddress(PST_CONTRACT_ADDRESS_SEPOLIA as `0x${string}`);
            } else if (chainId === zksyncSepoliaTestnet.id) {
                setCurrentPstContractAddress(PST_CONTRACT_ADDRESS_ZKSYNC_SEPOLIA as `0x${string}`);
            } else {
                setCurrentPstContractAddress(undefined); // No known contract on this chain
            }
        }
    }, [chainId]);

    const {
        data: hash,
        writeContract: createTransfer,
        isPending: isCreateTransferPending,
        error: createTransferError,
    } = useWriteContract();

    const { isLoading: isConfirming, isSuccess: isConfirmed, error: transactionError } = useWaitForTransactionReceipt({
        hash,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isConnected || !walletAddress || !currentPstContractAddress) {
            alert('Please connect your wallet and ensure you are on a supported network (Sepolia ETH or zkSync Sepolia).');
            return;
        }

        if (!isAddress(receiver)) {
            alert('Invalid receiver address.');
            return;
        }

        const isEthTransfer = tokenAddress === '0x0000000000000000000000000000000000000000';
        let parsedAmount: bigint;
        try {
            // Assuming 18 decimals for ETH and most ERC20s for simplicity. Adjust for specific tokens.
            parsedAmount = parseEther(amount);
        } catch (err) {
            alert('Invalid amount. Please enter a number.');
            return;
        }

        if (!password) {
            alert('Password cannot be empty.');
            return;
        }

        try {
            // Construct the args for createTransfer
            const args = [
                receiver as `0x${string}`,
                tokenAddress as `0x${string}`, // Pass the token address (0x0 for ETH)
                parsedAmount,
                password,
            ];

            // If it's an ETH transfer, include the value
            const value = isEthTransfer ? parsedAmount : undefined; // The contract calculates totalTransferCost including fee
            // For ETH, `msg.value` must cover amount + fee.
            // We're passing `amount` here, and the contract will revert
            // if `msg.value` (total sent) isn't enough.
            // For a more robust UI, you might try to estimate the fee.

            await createTransfer({
                address: currentPstContractAddress,
                abi: abi, // Your PST contract ABI
                functionName: 'createTransfer',
                args: args,
                value: value, // Value for ETH transfers
            });

        } catch (err) {
            console.error("Error initiating transfer:", err);
            // More user-friendly error handling based on err
            alert(`Failed to initiate transfer: ${(err as Error).message || err}`);
        }
    };

    const currentChainName = chainId === sepolia.id ? 'Sepolia ETH' : (chainId === zksyncSepoliaTestnet.id ? 'zkSync Sepolia' : 'Unsupported Network');

    // --- UI Elements ---
    const inputStyle: React.CSSProperties = {
        padding: '10px',
        margin: '10px 0',
        borderRadius: '4px',
        border: '1px solid #555',
        backgroundColor: '#333',
        color: '#eee',
        width: '300px',
    };

    const formStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        backgroundColor: '#282828',
        padding: '30px',
        borderRadius: '10px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
    };

    const labelStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '300px',
        color: '#ccc',
    };

    return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2>Create New Transfer</h2>

            {!isConnected && <p>Please connect your wallet to send a transfer.</p>}
            {isConnected && (
                <>
                    <p>Connected to: {currentChainName}</p>
                    {currentPstContractAddress ? (
                        <p>PST Contract Address: {currentPstContractAddress}</p>
                    ) : (
                        <>
                            <p>PST contract not deployed on {currentChainName}.</p>
                            <button
                                onClick={() => switchChain({ chainId: sepolia.id })}
                                style={{ ...buttonStyle, backgroundColor: '#FF9800', margin: '10px' }}
                            >
                                Switch to Sepolia ETH
                            </button>
                            <button
                                onClick={() => switchChain({ chainId: zksyncSepoliaTestnet.id })}
                                style={{ ...buttonStyle, backgroundColor: '#2196F3', margin: '10px' }}
                            >
                                Switch to zkSync Sepolia
                            </button>
                        </>
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
                                Amount (in units of token/ETH):
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

                            <button
                                type="submit"
                                disabled={isCreateTransferPending || isConfirming}
                                style={{
                                    ...buttonStyle,
                                    backgroundColor: '#4CAF50',
                                    color: '#fff',
                                    marginTop: '20px',
                                    opacity: (isCreateTransferPending || isConfirming) ? 0.7 : 1,
                                }}
                            >
                                {(isCreateTransferPending || isConfirming) ? 'Sending...' : 'Create Transfer'}
                            </button>

                            {hash && <p>Transaction Hash: <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#88f' }}>{hash}</a></p>}
                            {isConfirming && <p>Confirming transaction...</p>}
                            {isConfirmed && <p style={{ color: 'lightgreen' }}>Transfer Created Successfully!</p>}
                            {createTransferError && <p style={{ color: 'red' }}>Error: {createTransferError.message}</p>}
                            {transactionError && <p style={{ color: 'red' }}>Transaction Error: {transactionError.message}</p>}
                            <p style={{ marginTop: '20px', fontSize: '0.9em', color: '#999' }}>
                                * Note: For ERC20 transfers, you need to approve the PST contract to spend your tokens first. This UI does not currently include an approve step.
                            </p>
                        </form>
                    )}
                </>
            )}
        </div>
    );
};

export default SendTransfer;
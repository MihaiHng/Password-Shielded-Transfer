// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

/**
 * @title PreApprovedTokensLibrary
 * @author Mihai Hanga
 * @notice This library contains a list of preapproved tokens
 */
library PreApprovedTokensLibrary {
    /**
     * @dev List of preapproved tokens for main net
     *  address constant ETH = address(0);
     * address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
     * address constant UNI = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;
     * address constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
     * address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
     * address constant UST = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
     * address constant DAI = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
     * address constant LINK = 0x514910771AF9Ca656af840dff83E8264EcF986CA;
     * address constant BNB = 0xB8c77482e45F1F44dE1745F52C74426C631bDD52;
     */

    /**
     * @dev List of preapproved tokens on Spolia testnet
     */
    address constant SEPOLIA_ETH = address(0);
    address constant SEPOLIA_LINK = 0x779877A7B0D9E8603169DdbD7836e478b4624789;
    address constant SEPOLIA_USDC = 0x5fd84259d66Cd46123540766Be93DFE6D43130D7;

    function getPreApprovedTokens() external pure returns (address[] memory tokens) {
        tokens[0] = SEPOLIA_ETH;
        tokens[1] = SEPOLIA_LINK;
        tokens[2] = SEPOLIA_USDC;

        return tokens;
    }
}

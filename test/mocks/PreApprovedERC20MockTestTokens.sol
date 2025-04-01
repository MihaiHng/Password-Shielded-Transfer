// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";

/**
 * @title PreApprovedERC20MockTokensLibrary
 * @author Mihai Hanga
 * @notice This library contains a list of preapproved mock ERC20 tokens for Foundry testing
 */
library PreApprovedERC20MockTokensLibrary {
    /**
     * @dev Function to retrieve a list of approved mock ERC20 tokens to be used in fuzz/invariant testing in Foundry
     */
    function getPreApprovedERC20MockTokens() external pure returns (address[] memory tokens) {
        /**
         * @dev Deployment of mock ERC20 tokens
         */
        ERC20Mock mockERC20Token1 = new ERC20Mock("MockToken1", "MCK1", 1e31 ether);

        tokens = new address[](5); // Change the size of the array when changing the number of preapproved tokens

        tokens[0] = SEPOLIA_ETH;
        tokens[1] = SEPOLIA_LINK;
        tokens[2] = SEPOLIA_USDC;

        // Approve tokens
        // for (uint256 i = 0; i < tokens.length; i++) {
        //     address token = tokens[i];
        //     s_allowedTokens[token] = true;
        //     s_feeBalances[token] = 0;
        //     s_tokenList.push(token);
        // }

        return tokens;
    }
}

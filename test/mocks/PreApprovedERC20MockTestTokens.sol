// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ERC20Mock} from "../mocks/ERC20Mock.sol";

/**
 * @title PreApprovedERC20MockTokensLibrary
 * @author Mihai Hanga
 * @notice This library contains a list of mock ERC20 tokens for Foundry testing, which will be approved in the setUp()
 * function of TestInvariantsPST.sol
 */
library PreApprovedERC20MockTokensLibrary {
    /**
     * @dev Function to retrieve a list of mock ERC20 tokens to be used in fuzz/invariant testing in Foundry
     */
    function getPreApprovedERC20MockTokens() external returns (ERC20Mock[] memory tokens) {
        /**
         * @dev Deployment of mock ERC20 tokens
         */
        ERC20Mock mockERC20Token1 = new ERC20Mock("MockToken1", "MCK1", 1e31 ether);
        ERC20Mock mockERC20Token2 = new ERC20Mock("MockToken2", "MCK2", 1e31 ether);
        ERC20Mock mockERC20Token3 = new ERC20Mock("MockToken3", "MCK3", 1e31 ether);
        ERC20Mock mockERC20Token4 = new ERC20Mock("MockToken4", "MCK4", 1e31 ether);
        ERC20Mock mockERC20Token5 = new ERC20Mock("MockToken5", "MCK5", 1e31 ether);

        tokens = new ERC20Mock[](5); // Change the size of the array when changing the number of preapproved tokens

        tokens[0] = mockERC20Token1;
        tokens[1] = mockERC20Token2;
        tokens[2] = mockERC20Token3;
        tokens[3] = mockERC20Token4;
        tokens[4] = mockERC20Token5;

        return tokens;
    }
}

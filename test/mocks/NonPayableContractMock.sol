// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract NonPayableContractMock {
    constructor() {}

    // Explicitly reject ETH transfers
    receive() external payable {
        revert("NonPayableContract: Cannot receive ETH");
    }
}

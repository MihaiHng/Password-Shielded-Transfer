// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";

contract FailingReceiverMock {
    receive() external payable {
        console.log("FailingReceiverMock received ETH:", msg.value);
        revert("ETH transfer failed");
    }
}

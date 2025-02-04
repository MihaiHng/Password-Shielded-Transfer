// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

contract FailingERC20Mock_ForCancelTransferTest is ERC20, Test {
    address public SENDER = makeAddr("sender");

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        return false; // **Always fails**
    }
}

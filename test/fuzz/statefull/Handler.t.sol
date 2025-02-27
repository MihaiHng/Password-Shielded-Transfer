// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";

contract Handler {
    PST public pst;

    constructor(PST _pst) {
        pst = _pst;
    }

    function createTransfer(uint256 amount, address receiver) public {
        //pst.createTransfer{value: amount}(receiver);
    }

    function cancelTransfer(uint256 transferId) public {
        pst.cancelTransfer(transferId);
    }

    function claimTransfer(uint256 transferId) public {
        //pst.claimTransfer(transferId);
    }
}

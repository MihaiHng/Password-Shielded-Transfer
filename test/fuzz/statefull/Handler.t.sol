// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";

contract Handler is Test {
    PST public pst;

    uint256 MAX_AMOUNT_TO_SEND = type(uint96).max;
    uint256 MIN_AMOUNT_TO_SEND = 1e14;

    constructor(PST _pst) {
        pst = _pst;
    }

    function createTransfer(address receiver, address token, uint256 amount, string memory password) public {
        require(receiver != address(0), "Invalid receiver: zero address");
        require(receiver != msg.sender, "Invalid receiver: cannot be sender");

        require(token != address(0), "Invalid token: zero address");

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);

        require(bytes(password).length >= 7, "Password length must be at least 7");

        pst.createTransfer(receiver, token, amount, password);
    }

    function cancelTransfer(uint256 transferId) public {
        pst.cancelTransfer(transferId);
    }

    function claimTransfer(uint256 transferId, string memory password) public {
        pst.claimTransfer(transferId, password);
    }
}

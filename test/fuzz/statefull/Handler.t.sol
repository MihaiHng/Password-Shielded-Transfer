// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Handler is Test {
    PST public pst;

    uint256 MAX_AMOUNT_TO_SEND = type(uint96).max;
    uint256 MIN_AMOUNT_TO_SEND = 1e14;

    address[] public actors;
    address internal currentActor;

    constructor(PST _pst) {
        pst = _pst;
    }

    modifier useActor(uint256 actorIndexSeed) {
        currentActor = actors[bound(actorIndexSeed, 0, actors.length - 1)];
        vm.startPrank(currentActor);
        _;
        vm.stopPrank();
    }

    function createTransfer(
        address receiver,
        address token,
        uint256 amount,
        string memory password,
        uint256 actorIndexSeed
    ) public useActor(actorIndexSeed) {
        require(receiver != address(0), "Invalid receiver: zero address");
        require(receiver != msg.sender, "Invalid receiver: cannot be sender");

        require(token != address(0), "Invalid token address");

        require(pst.s_allowedTokens(token), "Invalid token: token not supported");

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);

        require(bytes(password).length >= 7, "Password length must be at least 7");

        IERC20(token).transfer(msg.sender, MAX_AMOUNT_TO_SEND);
        vm.deal(msg.sender, MAX_AMOUNT_TO_SEND);

        pst.createTransfer(receiver, token, amount, password);
    }

    function cancelTransfer(uint256 transferId, uint256 actorIndexSeed) public useActor(actorIndexSeed) {
        (address sender,,,,,,) = pst.s_transfersById(transferId);
        require(msg.sender == sender, "Only sender can cancel a transfer");

        require(pst.s_isPending(transferId), "Only pending transfers can be canceled");

        uint256 transferCounter = pst.s_transferCounter();
        require(transferId >= transferCounter, "Transfer Id not valid");

        pst.cancelTransfer(transferId);
    }

    function claimTransfer(uint256 transferId, string memory password) public {
        uint256 lastAttempt = pst.s_lastFailedClaimAttempt(transferId);
        require(block.timestamp < lastAttempt + pst.s_claimCooldownPeriod(), "Claim cooldown period not elapsed");

        (, address receiver,,,,,) = pst.s_transfersById(transferId);
        require(msg.sender != receiver, "Only receiver can claim the transfer");

        require(pst.s_isPending(transferId), "Only pending transfers can be claimed");

        require(bytes(password).length != 0, "No password provided");
        require(bytes(password).length >= pst.s_minPasswordLength(), "Password must be at least 7 characters long");

        pst.claimTransfer(transferId, password);
    }
}

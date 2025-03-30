// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Handler is Test {
    PST public pst;

    uint256 MAX_AMOUNT_TO_SEND = type(uint96).max;
    uint256 MIN_AMOUNT_TO_SEND = 1e14;

    // address[] public actors;
    // address internal currentActor;

    constructor(PST _pst) {
        pst = _pst;
    }

    // modifier useActor(uint256 actorIndexSeed) {
    //     currentActor = actors[bound(actorIndexSeed, 0, actors.length - 1)];
    //     vm.startPrank(currentActor);
    //     _;
    //     vm.stopPrank();
    // }

    // function createTransfer(
    //     address receiver,
    //     address token,
    //     uint256 amount,
    //     string memory password /*uint256 actorIndexSeed*/
    // ) public /*useActor(actorIndexSeed)*/ {
    //     console.log("Handler: createTransfer called");

    //     vm.assume(receiver != address(0) && receiver != msg.sender);

    //     vm.assume(token != address(0) && pst.s_allowedTokens(token));

    //     vm.assume(bytes(password).length >= 7);

    //     amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);

    //     IERC20(token).transfer(msg.sender, MAX_AMOUNT_TO_SEND);

    //     pst.createTransfer(receiver, token, amount, password);
    // }

    function createTransfer(address receiver, address token, uint256 amount, string memory password) public {
        console.log("Handler: createTransfer called");

        console.log("Checking receiver != address(0)");
        require(receiver != address(0), "Receiver cannot be zero address");

        console.log("Checking receiver != sender");
        require(receiver != msg.sender, "Receiver cannot be sender");

        console.log("Checking token != address(0)");
        require(token != address(0), "Token cannot be zero address");

        console.log("Checking if token is allowed");
        require(pst.s_allowedTokens(token), "Token not allowed");

        console.log("Checking password length");
        require(bytes(password).length >= 7, "Password too short");

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);
        console.log("Bound amount: ", amount);

        IERC20(token).approve(address(pst), 2000 ether);

        console.log("Calling createTransfer on PST contract...");
        pst.createTransfer(receiver, token, amount, password);

        console.log("createTransfer completed!");
    }

    function cancelTransfer(uint256 transferId /*uint256 actorIndexSeed*/ ) public /*useActor(actorIndexSeed)*/ {
        (address sender,,,,,,) = pst.s_transfersById(transferId);
        vm.assume(msg.sender == sender);

        vm.assume(pst.s_isPending(transferId));

        vm.assume(transferId < pst.s_transferCounter());

        pst.cancelTransfer(transferId);
    }

    function claimTransfer(uint256 transferId, string memory password) public {
        uint256 lastAttempt = pst.s_lastFailedClaimAttempt(transferId);
        vm.assume(block.timestamp < lastAttempt + pst.s_claimCooldownPeriod());

        (, address receiver,,,,,) = pst.s_transfersById(transferId);
        vm.assume(msg.sender != receiver);

        vm.assume(pst.s_isPending(transferId));

        vm.assume(bytes(password).length >= pst.s_minPasswordLength());

        pst.claimTransfer(transferId, password);
    }
}

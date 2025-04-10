// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";

contract Handler is Test {
    PST public pst;
    ERC20Mock[] public tokens;
    address public lastUsedToken;
    uint256 public transferCounter;

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

    function createTransfers(
        address receiver,
        uint256 amount,
        string memory password,
        /*uint256 actorIndexSeed*/
        uint256 tokenIndexedSeed
    ) public /*useActor(actorIndexSeed)*/ {
        console.log("Handler: createTransfer called");

        vm.assume(receiver != address(0) && receiver != address(this));

        vm.assume(bytes(password).length >= 7);

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);
        tokenIndexedSeed = bound(tokenIndexedSeed, 0, tokens.length - 1);
        console.log("Tokens length:", tokens.length);

        ERC20Mock selectedToken = getToken(tokenIndexedSeed);
        console.log("Selected token:", address(selectedToken));

        vm.prank(address(this));
        selectedToken.approve(address(pst), 1e30 ether);

        lastUsedToken = address(selectedToken);

        pst.createTransfer(receiver, address(selectedToken), amount, password);

        //vm.stopPrank();

        transferCounter++;
    }

    function cancelTransfer(uint256 transferId /*uint256 actorIndexSeed*/ ) public /*useActor(actorIndexSeed)*/ {
        console.log("Handler: cancelTransfer called");

        transferId = bound(transferId, 0, transferCounter);

        (address sender,,,,,,) = pst.s_transfersById(transferId);

        vm.assume(pst.s_isPending(transferId));

        vm.prank(sender);
        pst.cancelTransfer(transferId);
    }

    function claimTransfer(uint256 transferId, string memory password) public {
        console.log("Handler: claimTransfer called");

        uint256 lastAttempt = pst.s_lastFailedClaimAttempt(transferId);
        vm.assume(block.timestamp > lastAttempt + pst.s_claimCooldownPeriod());

        vm.assume(pst.s_isPending(transferId));

        (, address receiver,,,,,) = pst.s_transfersById(transferId);
        vm.assume(msg.sender != receiver);

        vm.assume(bytes(password).length >= pst.s_minPasswordLength());

        pst.claimTransfer(transferId, password);
    }

    function getToken(uint256 index) internal view returns (ERC20Mock) {
        return ERC20Mock(tokens[index % tokens.length]); // Ensure valid index selection
    }

    function setTokens(ERC20Mock[] memory _tokens) external {
        tokens = _tokens;
    }
}

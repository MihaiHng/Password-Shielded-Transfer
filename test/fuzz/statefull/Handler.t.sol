// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";

contract Handler is Test {
    PST public pst;
    address[] public tokens;
    ERC20Mock public link;
    ERC20Mock public usdc;

    uint256 MAX_AMOUNT_TO_SEND = type(uint96).max;
    uint256 MIN_AMOUNT_TO_SEND = 1e14;

    // address[] public actors;
    // address internal currentActor;

    constructor(PST _pst) {
        pst = _pst;

        // Deploy new mock tokens

        tokens = pst.getAppprovedTokens();
        link = ERC20Mock(tokens[1]);
        // usdc = ERC20Mock(tokens[2]);
    }

    // modifier useActor(uint256 actorIndexSeed) {
    //     currentActor = actors[bound(actorIndexSeed, 0, actors.length - 1)];
    //     vm.startPrank(currentActor);
    //     _;
    //     vm.stopPrank();
    // }

    function createTransfer(address receiver, address token, uint256 amount, string memory password)
        /*uint256 actorIndexSeed*/
        /*uint256 tokenIndexedSeed*/
        public /*useActor(actorIndexSeed)*/
    {
        console.log("Handler: createTransfer called");
        console.log("tokens length: ", tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            console.log("tokens: ", tokens[i]);
        }

        vm.assume(receiver != address(0) && receiver != msg.sender);

        vm.assume(bytes(password).length >= 7);

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);
        //tokenIndexedSeed = bound(tokenIndexedSeed, 0, tokens.length - 1);

        ERC20Mock selectedToken = link;
        console.log("Selected token:", address(selectedToken));

        // selectedToken.mint(address(this), 1e30);
        // selectedToken.approve(address(pst), 1e30);

        console.log("Approved Tokens:", tokens.length);

        pst.createTransfer(receiver, address(selectedToken), amount, password);
    }

    function cancelTransfer(uint256 transferId /*uint256 actorIndexSeed*/ ) public /*useActor(actorIndexSeed)*/ {
        console.log("Handler: cancelTransfer called");

        (address sender,,,,,,) = pst.s_transfersById(transferId);
        vm.assume(msg.sender == sender);

        vm.assume(pst.s_isPending(transferId));

        vm.assume(transferId < pst.s_transferCounter());

        pst.cancelTransfer(transferId);
    }

    function claimTransfer(uint256 transferId, string memory password) public {
        console.log("Handler: claimTransfer called");

        uint256 lastAttempt = pst.s_lastFailedClaimAttempt(transferId);
        vm.assume(block.timestamp > lastAttempt + pst.s_claimCooldownPeriod());

        (, address receiver,,,,,) = pst.s_transfersById(transferId);
        vm.assume(msg.sender != receiver);

        vm.assume(pst.s_isPending(transferId));

        vm.assume(bytes(password).length >= pst.s_minPasswordLength());

        pst.claimTransfer(transferId, password);
    }

    function getToken(uint256 index) public view returns (ERC20Mock) {
        return ERC20Mock(tokens[index % tokens.length]); // Ensure valid index selection
    }

    // function setTokens(ERC20Mock[] memory _tokens) public {
    //     tokens = _tokens;
    // }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";

contract Handler is Test {
    PST public pst;

    address public lastUsedToken;

    ERC20Mock[] public tokens;
    uint256[] public pendingTransfers;

    mapping(uint256 => address) public createdBy;
    mapping(uint256 => string) public passwords;

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

    function createTransfer(address receiver, uint256 amount, string memory password, uint256 tokenIndexedSeed)
        public
    {
        console.log("Handler: createTransfer called");

        vm.assume(receiver != address(0) && receiver != address(this));

        vm.assume(bytes(password).length >= 7);

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);
        tokenIndexedSeed = bound(tokenIndexedSeed, 0, tokens.length - 1);
        console.log("Tokens length:", tokens.length);

        ERC20Mock selectedToken = getToken(tokenIndexedSeed);
        console.log("Selected token:", address(selectedToken));

        selectedToken.approve(address(pst), 1e30 ether);

        lastUsedToken = address(selectedToken);

        pst.createTransfer(receiver, address(selectedToken), amount, password);

        uint256 transferId = pst.s_transferCounter() - 1; // Get latest ID
        pendingTransfers.push(transferId);
        //createdBy[transferId] = address(this);
        console.log("Transfer Id:", transferId);

        passwords[transferId] = password;
        console.log("Password:", passwords[transferId]);
    }

    function cancelTransfer(uint256 index) public {
        console.log("Handler: cancelTransfer called");

        if (pendingTransfers.length == 0) return;

        index = bound(index, 0, pendingTransfers.length - 1);
        uint256 transferId = pendingTransfers[index];

        vm.assume(pst.s_isPending(transferId));

        (address sender,,,,,,) = pst.s_transfersById(transferId);
        if (sender != address(this)) return;

        pst.cancelTransfer(transferId);

        pendingTransfers[index] = pendingTransfers[pendingTransfers.length - 1];
        pendingTransfers.pop();
    }

    function claimTransfer(uint256 index, bool useValidPassword, string memory invalidPassword) public {
        console.log("Handler: claimTransfer called");

        if (pendingTransfers.length == 0) return;

        index = bound(index, 0, pendingTransfers.length - 1);
        uint256 transferId = pendingTransfers[index];

        vm.assume(pst.s_isPending(transferId));

        //vm.warp(block.timestamp + 1);
        uint256 lastAttempt = pst.s_lastFailedClaimAttempt(transferId);
        vm.assume(block.timestamp > lastAttempt + pst.s_claimCooldownPeriod());

        // // (, address receiver,,,,,) = pst.s_transfersById(transferId);
        // // vm.assume(msg.sender != receiver);

        string memory password = useValidPassword ? passwords[transferId] : invalidPassword;
        //string memory password = passwords[transferId];

        // // vm.assume(bytes(password).length >= pst.s_minPasswordLength());

        // //if (!pst.checkPassword(transferId, password)) return;

        pst.claimTransfer(transferId, password);
    }

    function getToken(uint256 index) internal view returns (ERC20Mock) {
        return ERC20Mock(tokens[index % tokens.length]); // Ensure valid index selection
    }

    function setTokens(ERC20Mock[] memory _tokens) external {
        tokens = _tokens;
    }
}

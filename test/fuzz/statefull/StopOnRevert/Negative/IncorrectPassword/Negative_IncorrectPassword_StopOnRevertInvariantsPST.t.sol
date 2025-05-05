// SPDX-License-Identifier: MIT

// Negative Stop on Revert
// 1. A pending transfer can only be claimed with the correct password

pragma solidity ^0.8.28;

import {PST} from "src/PST.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../../../../../script/DeployPST.s.sol";
import {Negative_IncorrectPassword_StopOnRevertHandler} from "./Negative_IncorrectPassword_StopOnRevertHandler.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../../../../mocks/ERC20Mock.sol";

contract Negative_IncorrectPassword_StopOnRevertInvariantsPST is StdInvariant, Test {
    PST public pst;
    Negative_IncorrectPassword_StopOnRevertHandler public handler;
    ERC20Mock[] public tokens;

    // Mapping from token address to total pending amount
    mapping(address => uint256) public totalPendingPerToken;

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();

        ERC20Mock mockERC20Token1 = new ERC20Mock(
            "MockToken1",
            "MCK1",
            1e31 ether
        );
        ERC20Mock mockERC20Token2 = new ERC20Mock(
            "MockToken2",
            "MCK2",
            1e31 ether
        );
        ERC20Mock mockERC20Token3 = new ERC20Mock(
            "MockToken3",
            "MCK3",
            1e31 ether
        );

        tokens = new ERC20Mock[](3);

        tokens[0] = mockERC20Token1;
        tokens[1] = mockERC20Token2;
        tokens[2] = mockERC20Token3;

        handler = new Negative_IncorrectPassword_StopOnRevertHandler(pst);
        targetContract(address(handler));

        for (uint256 i = 0; i < tokens.length; i++) {
            ERC20Mock(tokens[i]).transfer(address(handler), 1e30 ether);

            vm.prank(pst.owner());
            pst.addTokenToAllowList(address(tokens[i]));
        }

        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.createTransfer.selector;
        selectors[1] = handler.createTransfer.selector;
        selectors[2] = handler.createTransfer.selector;
        selectors[3] = handler.cancelTransfer.selector;
        selectors[4] = handler.claimTransfer.selector;
        selectors[5] = handler.refundExpiredTransfer.selector;
        selectors[6] = handler.claimWithIncorrectPassword.selector;

        FuzzSelector memory selector = FuzzSelector({
            addr: address(handler),
            selectors: selectors
        });

        targetSelector(selector);

        handler.setTokens(tokens);

        console.log("Setup completed");
    }

    /**
    @dev fail_on_revert must be set to true for this test
    @notice Body of the function is empty because it only checks if the protocol reverts when claiming with incorrect password
    @notice Test is ok when it reverts because of claiming with incorrect password 
     */
    function invariant_PendingTransfersCanOnlyBeClaimedWithCorrectPassword()
        public
    {}

}

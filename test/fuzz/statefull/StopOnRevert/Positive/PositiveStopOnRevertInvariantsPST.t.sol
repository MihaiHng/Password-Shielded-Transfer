// SPDX-License-Identifier: MIT

// Positive Stop on Revert
// 1. Getter view functions should never revert

pragma solidity 0.8.28;

import {PST} from "src/PST.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../../../../script/DeployPST.s.sol";
import {PositiveStopOnRevertHandler} from "./PositiveStopOnRevertHandler.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../../../mocks/ERC20Mock.sol";

contract PositiveStopOnRevertInvariantsPST is StdInvariant, Test {
    PST public pst;
    PositiveStopOnRevertHandler public handler;
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

        handler = new PositiveStopOnRevertHandler(pst);
        targetContract(address(handler));

        for (uint256 i = 0; i < tokens.length; i++) {
            ERC20Mock(tokens[i]).transfer(address(handler), 1e30 ether);

            vm.prank(pst.owner());
            pst.addTokenToAllowList(address(tokens[i]));
        }

        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = handler.createTransfer.selector;
        selectors[1] = handler.createTransfer.selector;
        selectors[2] = handler.cancelTransfer.selector;
        selectors[3] = handler.claimTransfer.selector;
        selectors[4] = handler.refundExpiredTransfer.selector;

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
    @notice Test is ok when no getter function reverts 
     */
    function invariant_gettersCanNotRevert() public view {
        pst.getBalance();
        pst.getAllowedTokens();
        pst.getTrackedAddresses();
        pst.getTransferFees();

        for (uint8 i = 1; i <= 3; i++) {
            pst.getTransferFee(i);
        }

        for (uint256 i = 0; i < tokens.length && i < 5; i++) {
            address token = address(tokens[i]);
            pst.getBalanceForToken(token);
            pst.getAccumulatedFeesForToken(token);
        }

        for (
            uint256 i = 0;
            i < handler.getTrackedTransferIdsLength() && i < 5;
            i++
        ) {
            uint256 id = handler.getTrackedTransferIdAt(i);
            pst.getClaimCooldownStatus(id);
            pst.getTransferDetails(id);
        }

        pst.getPendingTransfers();
        pst.getCanceledTransfers();
        pst.getExpiredAndRefundedTransfers();
        pst.getClaimedTransfers();
        pst.getExpiredTransfers();

        for (uint256 i = 0; i < handler.getTrackedUsersLength() && i < 5; i++) {
            address user = handler.getTrackedUserAt(i);
            pst.getPendingTransfersForAddress(user);
            pst.getCanceledTransfersForAddress(user);
            pst.getExpiredAndRefundedTransfersForAddress(user);
            pst.getClaimedTransfersForAddress(user);
            pst.getAllTransfersByAddress(user);
        }
    }
}

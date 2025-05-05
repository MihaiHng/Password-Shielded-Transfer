// SPDX-License-Identifier: MIT

// Continue on Revert
// 1. Pst token balance is always equal to the sum of the total pending transfers value + fees value for that token
// 2. A pending transfer always expires and is refunded when the availability period has elapsed

pragma solidity ^0.8.28;

import {PST} from "src/PST.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../../../script/DeployPST.s.sol";
import {ERC20Mock} from "../../../mocks/ERC20Mock.sol";
import {ContinueOnRevertHandler} from "./ContinueOnRevertHandler.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ContinueOnRevertInvariantsPST is StdInvariant, Test {
    PST public pst;
    ContinueOnRevertHandler public handler;
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

        handler = new ContinueOnRevertHandler(pst);
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
        selectors[4] = handler.refundExpiredTransfers.selector;

        FuzzSelector memory selector = FuzzSelector({
            addr: address(handler),
            selectors: selectors
        });

        targetSelector(selector);

        handler.setTokens(tokens);

        console.log("Setup completed");
    }

    function invariant_pendingTransfersDoNotExceedTokenBalance() public {
        uint256 numTransfers = handler.getTrackedTransferIdsLength();

        for (uint256 i = 0; i < numTransfers; i++) {
            uint256 transferId = handler.getTrackedTransferIdAt(i);
            if (pst.s_isPending(transferId)) {
                (, , address token, uint256 amount, , , ) = pst.s_transfersById(
                    transferId
                );
                totalPendingPerToken[token] += amount;
            }
        }

        for (uint256 i = 0; i < tokens.length; i++) {
            address tokenAddr = address(tokens[i]);
            uint256 contractBalance = IERC20(tokenAddr).balanceOf(address(pst));
            uint256 accumulatedFeesForToken = pst.getAccumulatedFeesForToken(
                tokenAddr
            );
            assertLe(
                totalPendingPerToken[tokenAddr] + accumulatedFeesForToken,
                contractBalance
            );
        }
    }

    function invariant_pendingTransfersAlwaysExpireAndGetRefundedWhenAvailabilityElapses()
        public
        view
    {
        uint256 numTransfers = handler.getTrackedTransferIdsLength();

        //uint256 pendingTransfersLength = handler.getPendingTransfersLength();

        for (uint256 i = 0; i < numTransfers; i++) {
            uint256 transferId = handler.getTrackedTransferIdAt(i);
            (, , , , , uint256 expiringTime, ) = pst.s_transfersById(
                transferId
            );

            if (pst.s_isCanceled(transferId) || pst.s_isClaimed(transferId)) {
                continue;
            }

            (, , , uint256 currentAmount, , , string memory state) = pst
                .getTransferDetails(transferId);

            if (block.timestamp > expiringTime) {
                assertTrue(
                    pst.s_isExpiredAndRefunded(transferId),
                    "Transfer should be marked as expired and refunded"
                );
                assertEq(
                    currentAmount,
                    0,
                    "Expired transfer amount should be 0"
                );
                assertEq(
                    state,
                    "ExpiredAndRefunded",
                    "Expired transfer should be marked ExpiredAndRefunded"
                );
            }
        }
    }
}

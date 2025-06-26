// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";

contract TestPST_IntegrationChainlinkAutomation is Test {
    PST public pst;
    ERC20Mock public mockERC20Token;

    uint256 public totalTransferCost;
    uint256 public transferFeeCost;
    uint256 public transferId;

    // Constants for fee levels
    uint8 private constant LVL1 = 1;
    uint8 private constant LVL2 = 2;
    uint8 private constant LVL3 = 3;
    uint256 private constant TRANSFER_FEE_LVL_ONE = 1000; // 0.01% for <= LIMIT_LEVEL_ONE
    uint256 private constant TRANSFER_FEE_LVL_TWO = 100; // 0.001% for > LIMIT_LEVEL_ONE and <= LIMIT_LEVEL_TWO
    uint256 private constant TRANSFER_FEE_LVL_THREE = 10; // 0.0001% for > LIMIT_LEVEL_TWO
    uint256 private constant AMOUNT_LVL_ONE = 5 ether;
    uint256 private constant AMOUNT_LVL_TWO = 50 ether;
    uint256 private constant AMOUNT_LVL_THREE = 150 ether;
    uint256 private constant LIMIT_LEVEL_ONE = 10e18;
    uint256 private constant LIMIT_LEVEL_TWO = 100e18;
    uint256 private constant FEE_SCALING_FACTOR = 10e6;
    uint256 private constant AMOUNT_TO_SEND = 1 ether;

    string private constant PASSWORD = "Strongpass";

    address public SENDER = makeAddr("sender");
    address public ANOTHER_SENDER = makeAddr("another sender");
    address public RECEIVER = makeAddr("receiver");
    address public KEEPER = 0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad;
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();
        mockERC20Token = new ERC20Mock(
            "ERC20MockToken",
            "ERC20MOCK",
            1e6 ether
        );

        vm.startPrank(pst.owner());
        pst.addTokenToAllowList(address(mockERC20Token));
        pst.addTokenToAllowList(address(0));
        vm.stopPrank();

        vm.deal(SENDER, SENDER_BALANCE);
        mockERC20Token.transfer(SENDER, 100 ether);
        vm.deal(ANOTHER_SENDER, SENDER_BALANCE);
        mockERC20Token.transfer(ANOTHER_SENDER, 100 ether);

        (totalTransferCost, transferFeeCost) = TransferFeeLibrary
            .calculateTotalTransferCost(
                AMOUNT_TO_SEND,
                LIMIT_LEVEL_ONE,
                LIMIT_LEVEL_TWO,
                FEE_SCALING_FACTOR,
                pst.getTransferFees()
            );

        vm.prank(SENDER);
        mockERC20Token.approve(address(pst), 100 ether);
        vm.prank(ANOTHER_SENDER);
        mockERC20Token.approve(address(pst), 100 ether);

        transferId = pst.s_transferCounter();
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    modifier transferCreated() {
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        _;
    }

    modifier transferCreatedAndCanceled() {
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        transferId = pst.s_transferCounter() - 1;
        vm.prank(SENDER);
        pst.cancelTransfer(transferId);
        _;
    }

    modifier transferCreatedAndClaimed() {
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        transferId = pst.s_transferCounter() - 1;
        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);
        _;
    }

    modifier transferCreatedThenExpiredAndRefunded() {
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        transferId = pst.s_transferCounter() - 1;
        vm.warp(block.timestamp + pst.s_availabilityPeriod() + 1);
        vm.roll(block.number + 1);

        vm.prank(pst.owner());
        pst.refundExpiredTransfer(transferId);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                    TEST CHAINLINK AUTOMATION REFUND
    //////////////////////////////////////////////////////////////*/
    function testChainlinkAutomationRefund() public transferCreated {
        // Arrange
        uint256 transferId1 = pst.s_transferCounter() - 1;

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        uint256 transferId2 = pst.s_transferCounter() - 1;

        (, , , , , uint256 expiringTime1, ) = pst.s_transfersById(transferId1);
        (, , , , , uint256 expiringTime2, ) = pst.s_transfersById(transferId2);

        vm.warp(expiringTime1 + 1);
        vm.warp(expiringTime2 + 1);
        vm.roll(block.number + 1);

        // Act
        (bool upkeepNeeded, bytes memory performData) = pst.checkUpkeep("");

        // Assert upkeep is needed
        assertTrue(upkeepNeeded, "Upkeep should be needed");

        vm.prank(KEEPER);
        pst.performUpkeep(performData);

        // Assert
        assertTrue(
            pst.isExpiredAndRefundedTransfer(transferId1),
            "Transfer 1 should be refunded"
        );
        assertTrue(
            pst.isExpiredAndRefundedTransfer(transferId2),
            "Transfer 2 should be refunded"
        );

        uint256 senderBalanceAfter = SENDER.balance;
        assertTrue(
            senderBalanceAfter >= AMOUNT_TO_SEND * 2,
            "Sender should receive refunded funds"
        );
    }

    function testChainlinkAutomationMaintenance()
        public
        transferCreated
        transferCreatedAndCanceled
        transferCreatedAndClaimed
        transferCreatedThenExpiredAndRefunded
    {
        // Arrange
        vm.prank(ANOTHER_SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        vm.prank(ANOTHER_SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        transferId = pst.s_transferCounter() - 1;
        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);

        vm.warp(block.timestamp + pst.s_cleanupInterval());
        vm.roll(block.number + 1);

        // Act
        vm.prank(KEEPER);
        pst.performMaintenance();

        // Assert
        uint256 canceledForAddressLength = pst
            .getCanceledTransferForAddressCount(SENDER);
        assertEq(canceledForAddressLength, 0);
        uint256 claimedTransfersForAddress0Length = pst
            .getClaimedTransfersForAddressCount(SENDER);
        assertEq(claimedTransfersForAddress0Length, 0);
        uint256 expiredAndRefundedForAddressLength = pst
            .getExpiredAndRefundedTransfersForAddressCount(SENDER);
        assertEq(expiredAndRefundedForAddressLength, 0);
        uint256 claimedTransfersForAddress1Length = pst
            .getClaimedTransfersForAddressCount(ANOTHER_SENDER);
        assertEq(claimedTransfersForAddress1Length, 0);

        assertTrue(
            pst.getPendingTransfersForAddress(SENDER).length > 0,
            "SENDER's pending transfers should not be removed"
        );
        assertTrue(
            pst.getPendingTransfersForAddress(ANOTHER_SENDER).length > 0,
            "ANOTHER_SENDER's pending transfers should not be removed"
        );

        assertFalse(
            pst.isAddressInTracking(SENDER),
            "SENDER should be removed for inactivity"
        );
        assertFalse(
            pst.isAddressInTracking(ANOTHER_SENDER),
            "ANOTHER_SENDER should be removed for inactivity"
        );
    }
}

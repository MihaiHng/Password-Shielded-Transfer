// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import {PST_Store} from "../../src/PST_Store.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";

contract TestPST_UtilityFunctions is Test {
    error OwnableUnauthorizedAccount(address account);

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
    //uint256 private constant MIN_PASSWORD_LENGTH = ;

    address public SENDER = makeAddr("sender");
    address public RECEIVER = makeAddr("receiver");
    address RANDOM_USER = makeAddr("Random user");
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;
    uint256 public constant RANDOM_USER_BALANCE = 100 ether;

    event LastInteractionTimeUpdated(
        address indexed user,
        uint256 indexed lastInteractionTime
    );
    event TokenAddedToAllowList(address indexed token);
    event TokenRemovedFromAllowList(address indexed token);

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
        vm.prank(SENDER);
        mockERC20Token.approve(address(pst), 100 ether);

        vm.deal(RANDOM_USER, RANDOM_USER_BALANCE);
        mockERC20Token.transfer(RANDOM_USER, 100 ether);
        vm.prank(RANDOM_USER);
        mockERC20Token.approve(address(pst), 100 ether);

        (totalTransferCost, transferFeeCost) = TransferFeeLibrary
            .calculateTotalTransferCost(
                AMOUNT_TO_SEND,
                LIMIT_LEVEL_ONE,
                LIMIT_LEVEL_TWO,
                FEE_SCALING_FACTOR,
                pst.getTransferFees()
            );

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
        vm.warp(block.timestamp + pst.s_cancelCooldownPeriod() + 1);
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
                        UTILITY FUNCTIONS TESTS
    //////////////////////////////////////////////////////////////*/
    function testTransferOwnership() public {
        // Arrange
        address NEW_OWNER = makeAddr("NewOwner");

        // Act
        vm.prank(pst.owner());
        pst.transferOwnership(NEW_OWNER);

        // Assert
        assertEq(NEW_OWNER, pst.owner(), "New owner should be NEW_OWNER");
    }

    function testOnlyOwnerCanTransferOwnership() public {
        // Arrange
        address NEW_OWNER = makeAddr("NewOwner");

        // Act / Assert
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, SENDER)
        );
        vm.prank(SENDER);
        pst.transferOwnership(NEW_OWNER);
    }

    function testTransferOwnershipRevertsIfNewOwnerIsAddressZero() public {
        // Arrange / Act / Assert
        vm.prank(pst.owner());
        vm.expectRevert(PST_Store.PST__InvalidNewOwnerAddress.selector);
        pst.transferOwnership(address(0));
    }

    function testRemoveFromPendingTransfersRevertsIfNoPendingTransfers()
        public
    {
        // Act / Assert
        vm.expectRevert(PST_Store.PST__TransferNotPending.selector);
        vm.prank(SENDER);
        pst.removeFromPendingTransfers(0);
    }

    function testRemoveFromPendingTransfersByAddressRevertsIfNoPendingTransfers()
        public
    {
        // Act / Assert
        vm.expectRevert(PST_Store.PST__TransferNotPending.selector);
        vm.prank(SENDER);
        pst.removeFromPendingTransfersByAddress(SENDER, 0);
    }

    function testAddTokenToAllowList() public {
        // Arrange
        ERC20Mock newToken = new ERC20Mock("NewToken", "NT", 1e6);
        address[] memory tokenListBefore = pst.getAllowedTokens();
        uint256 initialLength = tokenListBefore.length;
        bool allowedToken = pst.s_allowedTokens(address(newToken));

        // Act
        vm.prank(pst.owner());
        vm.expectEmit(true, true, true, true);
        emit TokenAddedToAllowList(address(newToken));
        pst.addTokenToAllowList(address(newToken));
        address[] memory tokenListAfter = pst.getAllowedTokens();
        uint256 newLength = tokenListAfter.length;
        allowedToken = pst.s_allowedTokens(address(newToken));
        uint256 newTokenFeeBalance = pst.s_feeBalances(address(newToken));

        // Assert
        assertEq(
            newLength,
            initialLength + 1,
            "Token list should have a new added token"
        );
        assertTrue(allowedToken, "Token not in allow list");
        assertEq(
            tokenListAfter[newLength - 1],
            address(newToken),
            "Token should be last in the list"
        );
        assertEq(
            newTokenFeeBalance,
            0,
            "Fee balance should be initialized to 0"
        );

        vm.prank(pst.owner());
        vm.expectRevert(PST_Store.PST__TokenAlreadyWhitelisted.selector);
        pst.addTokenToAllowList(address(newToken));
    }

    function testRemoveTokenFromAllowList() public {
        // Arrange
        ERC20Mock newToken = new ERC20Mock("NewToken", "NT", 1e6);
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(newToken));
        address[] memory tokenListBefore = pst.getAllowedTokens();
        uint256 initialLength = tokenListBefore.length;
        bool allowedToken = pst.s_allowedTokens(address(newToken));

        // Act
        vm.prank(pst.owner());
        vm.expectEmit(true, true, true, true);
        emit TokenRemovedFromAllowList(address(newToken));
        pst.removeTokenFromAllowList(address(newToken));
        address[] memory tokenListAfter = pst.getAllowedTokens();
        uint256 newLength = tokenListAfter.length;
        allowedToken = pst.s_allowedTokens(address(newToken));

        // Assert
        assertEq(
            newLength,
            initialLength - 1,
            "Token list should have a removed token"
        );
        assertFalse(allowedToken, "Removed token should not be in allow list");
        for (uint256 i = 0; i < newLength; i++) {
            assertFalse(
                tokenListAfter[i] == address(newToken),
                "Removed token should not be in allow list"
            );
        }
    }

    function testsetNewMinPasswordLength() public {
        // Arrange
        uint256 NEW_MIN_PASSRORD_LENGTH = 12;

        // Act
        vm.prank(pst.owner());
        pst.setNewMinPasswordLength(NEW_MIN_PASSRORD_LENGTH);
        uint256 minPasswordLength = pst.s_minPasswordLength();

        // Assert
        assertEq(
            minPasswordLength,
            NEW_MIN_PASSRORD_LENGTH,
            "New minim password length is not correct"
        );
    }

    function testsetNewClaimCooldownPeriod() public {
        // Arrange
        uint256 NEW_CLAIM_COOLDOWN_PERIOD = 1 hours;

        // Act
        vm.prank(pst.owner());
        pst.setNewClaimCooldownPeriod(NEW_CLAIM_COOLDOWN_PERIOD);
        uint256 claimCooldownPeriod = pst.s_cancelCooldownPeriod();

        // Assert
        assertEq(
            claimCooldownPeriod,
            NEW_CLAIM_COOLDOWN_PERIOD,
            "New claim cooldown period is not correct"
        );
    }

    function testsetNewAvailabilityPeriod() public {
        // Arrange
        uint256 NEW_AVAILABILIITY_PERIOD = 8 days;

        // Act
        vm.prank(pst.owner());
        pst.setNewAvailabilityPeriod(NEW_AVAILABILIITY_PERIOD);
        uint256 avalabilityPeriod = pst.s_availabilityPeriod();

        // Assert
        assertEq(
            avalabilityPeriod,
            NEW_AVAILABILIITY_PERIOD,
            "New availability period is not correct"
        );
    }

    function testsetNewCleanupInterval() public {
        // Arrange
        uint256 NEW_CLEANUP_INTERVAL = 8 days;

        // Act
        vm.prank(pst.owner());
        pst.setNewCleanupInterval(NEW_CLEANUP_INTERVAL);
        uint256 cleanupInterval = pst.s_cleanupInterval();

        // Assert
        assertEq(
            cleanupInterval,
            NEW_CLEANUP_INTERVAL,
            "New cleanup interval is not correct"
        );
    }

    function testsetNewInactivityThreshold() public {
        // Arrange
        uint256 NEW_INCATIVITY_THRESHOLD = 10 weeks;

        // Act
        vm.prank(pst.owner());
        pst.setNewInactivityThreshold(NEW_INCATIVITY_THRESHOLD);
        uint256 inactivityThreshold = pst.s_inactivityThreshold();

        // Assert
        assertEq(
            inactivityThreshold,
            NEW_INCATIVITY_THRESHOLD,
            "New inactivity threshold is not correct"
        );
    }

    function testsetNewBatchLimit() public {
        // Arrange
        uint256 NEW_BATCH_LIMIT = 51;

        // Act
        vm.prank(pst.owner());
        pst.setNewBatchLimit(NEW_BATCH_LIMIT);
        uint256 batchLimit = pst.s_batchLimit();

        // Assert
        assertEq(batchLimit, NEW_BATCH_LIMIT, "New batch limit is not correct");
    }

    function testRefundExpiredTransferCorrectlyRefundsSenderForEth() public {
        // Arrange
        uint256 senderBalanceBefore = SENDER.balance;
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        // Act
        pst.refundExpiredTransfer(transferId);
        uint256 senderBalanceAfter = SENDER.balance;

        // Assert
        assertEq(
            senderBalanceAfter,
            senderBalanceBefore - transferFeeCost,
            "Sender should be refunded"
        );
    }

    function testRefundExpiredTransferCorrectlyRefundsSenderForERC20() public {
        // Arrange
        uint256 senderBalanceBefore = mockERC20Token.balanceOf(SENDER);
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        // Act
        pst.refundExpiredTransfer(transferId);
        uint256 senderBalanceAfter = mockERC20Token.balanceOf(SENDER);

        // Assert
        assertEq(
            senderBalanceAfter,
            senderBalanceBefore - transferFeeCost,
            "Sender should be refunded"
        );
    }

    function testRefundExpiredTransfer() public transferCreated {
        // Arrange
        transferId = pst.s_transferCounter() - 1;
        pst.refundExpiredTransfer(transferId);
        uint256[] memory expiredAndRefundedTransfers = pst
            .getExpiredAndRefundedTransfers();
        uint256 initialLength = expiredAndRefundedTransfers.length;

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;
        pst.refundExpiredTransfer(transferId);
        bool isExpiredAndRefunded = pst.isExpiredAndRefundedTransfer(
            transferId
        );
        bool isPending = pst.isPendingTransfer(transferId);
        (, , , uint256 transferAmount, , , ) = pst.s_transfersById(transferId);
        uint256[] memory updatedExpiredAndRefundedTransfers = pst
            .getExpiredAndRefundedTransfers();
        uint256 newLength = updatedExpiredAndRefundedTransfers.length;

        // Assert
        assertTrue(
            isExpiredAndRefunded,
            "Transfer Id should be classified as expired and refunded"
        );
        assertFalse(isPending, "Transfer Id should not be pending");
        assertEq(transferAmount, 0, "Transfer amount should be 0");
        assertEq(
            newLength,
            initialLength + 1,
            "Expired and refunded transfer array length should increse by one"
        );
        assertEq(
            updatedExpiredAndRefundedTransfers[newLength - 1],
            transferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testAddAddressToTracking() public {
        // Arrange
        address[] memory addressList = pst.getTrackedAddresses();
        uint256 initialLength = addressList.length;

        // Act
        vm.prank(pst.owner());
        pst.addAddressToTracking(RANDOM_USER);
        address[] memory updatedAddressList = pst.getTrackedAddresses();
        uint256 updatedLength = updatedAddressList.length;
        bool tracking = pst.isAddressInTracking(RANDOM_USER);

        // Assert
        assertEq(
            updatedLength,
            initialLength + 1,
            "Tracked addresses array length should increase by one"
        );
        assertEq(
            pst.s_addressList(updatedLength - 1),
            RANDOM_USER,
            "User should be the last element in the address list"
        );
        assertTrue(tracking, "Adress is not in tracking");
        assertEq(
            pst.s_lastCleanupTimeByAddress(RANDOM_USER),
            block.timestamp,
            "Last cleanup time should be set correctly"
        );
    }

    function testRemoveAddressFromTracking() public transferCreated {
        // Arrange
        vm.prank(pst.owner());
        pst.addAddressToTracking(RANDOM_USER);
        address[] memory expiredAndRefundedTransfers = pst
            .getTrackedAddresses();
        uint256 initialLength = expiredAndRefundedTransfers.length;

        // Act
        vm.prank(pst.owner());
        pst.removeAddressFromTracking(RANDOM_USER);
        address[] memory updatedAddressList = pst.getTrackedAddresses();
        uint256 updatedLength = updatedAddressList.length;

        // Assert
        assertEq(
            updatedLength,
            initialLength - 1,
            "Address list size should decrease by 1"
        );

        for (uint256 i = 0; i < updatedLength; i++) {
            assertFalse(
                pst.s_addressList(i) == RANDOM_USER,
                "User should be removed from address list"
            );
        }

        assertFalse(
            pst.isAddressInTracking(RANDOM_USER),
            "User should no longer be tracked"
        );
        assertEq(
            pst.s_lastInteractionTime(RANDOM_USER),
            0,
            "Last interaction time should be reset"
        );
        assertEq(
            pst.s_lastCleanupTimeByAddress(RANDOM_USER),
            0,
            "Last cleanup time should be reset"
        );
    }

    function testRemoveFromPendingTransfers() public transferCreated {
        // Arrange
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        uint256[] memory pendingTransfers = pst.getPendingTransfers();
        uint256 initialLength = pendingTransfers.length;
        transferId = pst.s_transferCounter() - 1;

        // Act
        pst.removeFromPendingTransfers(transferId);
        uint256[] memory updatedPendingTransfers = pst.getPendingTransfers();
        uint256 newLength = updatedPendingTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength - 1,
            "Pending transfers array length should decrease by one"
        );

        for (uint256 i = 0; i < newLength; i++) {
            assertFalse(
                updatedPendingTransfers[i] == transferId,
                "Transfer ID should be removed from pending list"
            );
        }
    }

    function testRemoveFromPendingTransfersByAddress() public transferCreated {
        // Arrange
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        uint256[] memory pendingTransfers = pst.getPendingTransfersForAddress(
            SENDER
        );
        uint256 initialLength = pendingTransfers.length;
        transferId = pst.s_transferCounter() - 1;

        // Act
        pst.removeFromPendingTransfersByAddress(SENDER, transferId);
        uint256[] memory updatedPendingTransfers = pst
            .getPendingTransfersForAddress(SENDER);
        uint256 newLength = updatedPendingTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength - 1,
            "Pending transfers array length should decrease by one"
        );

        for (uint256 i = 0; i < newLength; i++) {
            assertFalse(
                updatedPendingTransfers[i] == transferId,
                "Transfer ID should be removed from pending list"
            );
        }
    }

    function testRemoveAllCanceledTransfersByAddress()
        public
        transferCreatedAndCanceled
    {
        // Arrange
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
        uint256[] memory canceledTransfersByAddress = pst
            .getCanceledTransfersForAddress(SENDER);
        uint256 length = canceledTransfersByAddress.length;
        console.log(length);

        // Act
        vm.prank(pst.owner());
        pst.removeAllCanceledTransfersByAddress(SENDER);

        // Assert
        uint256 canceledForAddressLength = pst
            .getCanceledTransferForAddressCount(SENDER);
        assertEq(canceledForAddressLength, 0);
    }

    function testRemoveAllExpiredAndRefundedTransfersByAddress()
        public
        transferCreated
    {
        // Arrange
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        vm.warp(block.timestamp + pst.s_availabilityPeriod() + 1);
        vm.roll(block.number + 1);

        uint256[] memory expiredTransfers = pst.getExpiredTransfers();
        uint256 expiredCount = expiredTransfers.length;

        for (uint256 i = 0; i < expiredCount; i++) {
            pst.refundExpiredTransfer(expiredTransfers[i]);
        }

        uint256[] memory expiredAndRefundedTransfersByAddress = pst
            .getExpiredAndRefundedTransfersForAddress(SENDER);
        uint256 length = expiredAndRefundedTransfersByAddress.length;
        console.log(length);

        // Act
        vm.prank(pst.owner());
        pst.removeAllExpiredAndRefundedTransfersByAddress(SENDER);

        // Assert
        uint256 expiredAndRefundedForAddressLength = pst
            .getExpiredAndRefundedTransfersForAddressCount(SENDER);
        assertEq(expiredAndRefundedForAddressLength, 0);
    }

    function testRemoveAllClaimedTransfersByAddress()
        public
        transferCreatedAndClaimed
    {
        // Arrange
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        vm.warp(block.timestamp + pst.s_cancelCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        transferId = pst.s_transferCounter() - 1;
        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);
        uint256[] memory claimedTransfersByAddress = pst
            .getClaimedTransfersForAddress(SENDER);
        uint256 length = claimedTransfersByAddress.length;
        console.log(length);

        // Act
        vm.prank(pst.owner());
        pst.removeAllClaimedTransfersByAddress(SENDER);

        // Assert
        uint256 claimedTransfersForAddress1Length = pst
            .getClaimedTransfersForAddressCount(SENDER);
        assertEq(claimedTransfersForAddress1Length, 0);
    }

    function testClearHistory()
        public
        transferCreatedAndClaimed
        transferCreatedAndCanceled
        transferCreatedThenExpiredAndRefunded
    {
        // Arrange
        uint256 expectedCleanupTime = block.timestamp +
            pst.s_cleanupInterval() +
            1;
        vm.warp(block.timestamp + pst.s_cleanupInterval() + 1);

        // Act
        vm.prank(pst.owner());
        pst.clearHistory();

        uint256 lastCleanupTime = pst.s_lastCleanupTimeByAddress(SENDER);
        bool isTracked = pst.s_trackedAddresses(SENDER);

        // Assert
        assertEq(
            lastCleanupTime,
            expectedCleanupTime,
            "Cleanup time should be updated"
        );

        assertTrue(
            isTracked,
            "Address should still be tracked if more pending transfers exist"
        );

        uint256 canceledForAddressLength = pst
            .getCanceledTransferForAddressCount(SENDER);
        assertEq(canceledForAddressLength, 0);
        uint256 claimedTransfersForAddress0Length = pst
            .getClaimedTransfersForAddressCount(SENDER);
        assertEq(claimedTransfersForAddress0Length, 0);
        uint256 expiredAndRefundedForAddressLength = pst
            .getExpiredAndRefundedTransfersForAddressCount(SENDER);
        assertEq(expiredAndRefundedForAddressLength, 0);
    }

    function testRemoveInactiveAddresses() public {
        // Arrange
        pst.addAddressToTracking(SENDER);
        pst.addAddressToTracking(RECEIVER);
        address[] memory initialAddressList = pst.getTrackedAddresses();
        uint256 initialLength = initialAddressList.length;
        vm.warp(block.timestamp + pst.s_inactivityThreshold() + 1);
        vm.roll(block.timestamp + 1);

        // Act
        vm.prank(pst.owner());
        pst.removeInactiveAddresses();
        address[] memory updatedAddressList = pst.getTrackedAddresses();
        uint256 updatedLength = updatedAddressList.length;

        // Assert
        assertEq(
            updatedLength,
            initialLength - 2,
            "Tracked addresses array length should decrease by two"
        );
    }

    function testGetAllTransfersByAddress()
        public
        transferCreated
        transferCreatedAndClaimed
        transferCreatedAndCanceled
        transferCreatedThenExpiredAndRefunded
    {
        // Arrange
        uint256[] memory expectedPending = pst.getPendingTransfersForAddress(
            SENDER
        );
        uint256[] memory expectedCanceled = pst.getCanceledTransfersForAddress(
            SENDER
        );
        uint256[] memory expectedExpired = pst
            .getExpiredAndRefundedTransfersForAddress(SENDER);
        uint256[] memory expectedClaimed = pst.getClaimedTransfersForAddress(
            SENDER
        );

        // Log stored transfer IDs
        console.log("Pending:", expectedPending[0]);
        console.log("Canceled:", expectedCanceled[0]);
        console.log("Expired:", expectedExpired[0]);
        console.log("Claimed:", expectedClaimed[0]);

        // Act
        (
            uint256[] memory pending,
            uint256[] memory canceled,
            uint256[] memory expired,
            uint256[] memory claimed
        ) = pst.getAllTransfersByAddress(SENDER);

        //console.log("All Transfers:", pending[0], canceled[0], expired[0], claimed[0]);

        // Assert
        assertEq(
            pending.length,
            expectedPending.length,
            "Pending transfers array length should match"
        );
        assertEq(
            canceled.length,
            expectedCanceled.length,
            "Canceled transfers array length should match"
        );
        assertEq(
            expired.length,
            expectedExpired.length,
            "Expired transfers array length should match"
        );
        assertEq(
            claimed.length,
            expectedClaimed.length,
            "Claimed transfers array length should match"
        );

        for (uint256 i = 0; i < pending.length; i++) {
            assertEq(
                pending[i],
                expectedPending[i],
                "Pending transfer ID mismatch"
            );
        }

        for (uint256 i = 0; i < canceled.length; i++) {
            assertEq(
                canceled[i],
                expectedCanceled[i],
                "Canceled transfer ID mismatch"
            );
        }

        for (uint256 i = 0; i < expired.length; i++) {
            assertEq(
                expired[i],
                expectedExpired[i],
                "Expired transfer ID mismatch"
            );
        }

        for (uint256 i = 0; i < claimed.length; i++) {
            assertEq(
                claimed[i],
                expectedClaimed[i],
                "Claimed transfer ID mismatch"
            );
        }
    }

    function testGetTransferDetails_Pending() public transferCreated {
        // Arrange
        transferId = pst.s_transferCounter() - 1;

        // Act
        (
            address sender,
            address receiver,
            address token,
            uint256 amount,
            uint256 creationTime,
            uint256 expiringTime,
            string memory state
        ) = pst.getTransferDetails(transferId);

        // Assert
        assertEq(sender, SENDER, "Sender address mismatch");
        assertEq(receiver, RECEIVER, "Receiver address mismatch");
        assertEq(token, address(mockERC20Token), "Token address mismatch");
        assertEq(amount, AMOUNT_TO_SEND, "Amount mismatch");
        assertTrue(creationTime > 0, "Creation time should be set");
        assertTrue(
            expiringTime > creationTime,
            "Expiring time should be after creation"
        );
        assertEq(state, "Pending", "State should be Pending");
    }

    function testGetTransferDetails_Canceled()
        public
        transferCreatedAndCanceled
    {
        // Arrange
        transferId = pst.s_transferCounter() - 1;

        // Act
        (, , , , , , string memory state) = pst.getTransferDetails(transferId);

        // Assert
        assertEq(state, "Canceled", "State should be Canceled");
    }

    function testIsPendingTransferReturnsTrue() public transferCreated {
        // Act
        bool isPending = pst.isPendingTransfer(transferId);

        // Assert
        assertTrue(isPending, "Transfer should be pending initially");
    }

    function testIsClaimedReturnsTrue() public transferCreatedAndClaimed {
        // Act
        bool claimed = pst.isClaimed(transferId);

        // Assert
        assertTrue(claimed, "Transfer should be marked as claimed");
    }

    function testIsCanceledTransferReturnsTrue()
        public
        transferCreatedAndCanceled
    {
        // Act
        bool isCanceled = pst.isCanceledTransfer(transferId);

        // Assert
        assertTrue(isCanceled, "Canceled transfer should return true");
    }

    function testIsExpiredAndRefundedTransferReturnsTrue()
        public
        transferCreatedThenExpiredAndRefunded
    {
        // Act
        bool isExpiredAndRefunded = pst.isExpiredAndRefundedTransfer(
            transferId
        );

        // Assert
        assertTrue(
            isExpiredAndRefunded,
            "Transfer should be expired and refunded after refund"
        );
    }
}

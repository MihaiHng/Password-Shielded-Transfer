// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";
import {FailingERC20Mock_ForCreateTransferTest} from "../mocks/FailingERC20Mock_ForCreateTransferTest.sol";
import {FailingERC20Mock_ForCancelAndClaimTransferTest} from "../mocks/FailingERC20Mock_ForCancelAndClaimTransferTest.sol";
import {NonPayableContractMock} from "../mocks/NonPayableContractMock.sol";

contract TestPST_MainFunctions is Test {
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
    uint256 private constant MIN_AMOUNT_TO_SEND = 1e14; // 1 ether / 1e4 => 0.0001 ether

    string private constant PASSWORD = "Strongpass";

    address public SENDER = makeAddr("sender");
    address public RECEIVER = makeAddr("receiver");
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;

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

        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(mockERC20Token));

        vm.deal(SENDER, SENDER_BALANCE);
        mockERC20Token.transfer(SENDER, 100 ether);

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

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                        CREATE TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    function testCreateTransferRevertsWhenAmountIsNotMoreThanZero() public {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__NeedsMoreThanZero.selector);
        pst.createTransfer(RECEIVER, address(mockERC20Token), 0, PASSWORD);
    }

    function testCreateTransferRevertsWhenReceiverIsNotValid()
        public
        transferCreated
    {
        // Arrange
        address INVALID_RECEIVER = address(0);

        // Act // Assert
        vm.expectRevert(PST.PST__InvalidAddress.selector);
        pst.createTransfer(
            INVALID_RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    function testCreateTransferRevertsWhenTokenNotAllowed() public {
        // Arrange
        ERC20Mock na_mockERC20Token = new ERC20Mock(
            "NotAllowedERC20MockToken",
            "NAERC20MOCK",
            1e6 ether
        );
        na_mockERC20Token.transfer(SENDER, 100 ether);

        // Act // Assert
        vm.expectRevert(PST.PST__TokenNotAllowed.selector);
        pst.createTransfer(
            RECEIVER,
            address(na_mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    function testCreateTransferRevertsWhenSendingToOWnAddress() public {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__CantSendToOwnAddress.selector);
        vm.prank(SENDER);
        pst.createTransfer(
            SENDER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    function testCreateTransferRevertsWhenAmountToSendIsTooLow() public {
        // Arrange / Act
        uint256 TOO_SMALL_AMOUNT = 1e12;

        // Assert
        vm.expectRevert(
            abi.encodeWithSelector(
                PST.PST__AmountToSendShouldBeHigher.selector,
                MIN_AMOUNT_TO_SEND
            )
        );
        vm.prank(SENDER);
        pst.createTransfer(
            RECEIVER,
            address(mockERC20Token),
            TOO_SMALL_AMOUNT,
            PASSWORD
        );
    }

    function testCreateTransferRevertsWhenPasswordNotProvided() public {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__PasswordNotProvided.selector);
        pst.createTransfer(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            ""
        );
    }

    function testCreateTransferRevertsWhenPasswordIsTooShort() public {
        // Arrange
        uint256 MIN_PASSWORD_LENGTH = pst.s_minPasswordLength();
        string memory SHORT_PASSWORD = "NoGood";

        // Act // Assert
        vm.expectRevert(
            abi.encodeWithSelector(
                PST.PST__PasswordTooShort.selector,
                MIN_PASSWORD_LENGTH
            )
        );
        pst.createTransfer(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            SHORT_PASSWORD
        );
    }

    function testCreateTransferStoresTransferDetails() public transferCreated {
        // Arrange / Act
        transferId = pst.s_transferCounter() - 1;

        (
            address sender,
            address receiver,
            address token,
            uint256 amount,
            uint256 creationTime,
            uint256 expiringTime,
            bytes32 encodedPassword
        ) = pst.s_transfersById(transferId);

        bytes32 salt = keccak256(
            abi.encodePacked(transferId, sender, receiver)
        );
        bytes32 passwordHash = keccak256(abi.encodePacked(PASSWORD, salt));

        // Assert
        assertEq(sender, SENDER, "Sender address should match");
        assertEq(receiver, RECEIVER, "Receiver address should match");
        assertEq(token, address(mockERC20Token), "Token address should match");
        assertEq(amount, AMOUNT_TO_SEND, "Transfer amount should match");
        assertGt(creationTime, 0, "Creation time should be set");
        assertGt(expiringTime, 0, "Expiring time should be set");
        assertEq(
            encodedPassword,
            passwordHash,
            "Stored password hash should match"
        );
    }

    function testCreateTransferGeneratesSequentialIds() public {
        // Arrange
        uint256 firstTransferId = pst.s_transferCounter();

        // Act
        vm.startPrank(SENDER);

        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        uint256 secondTransferId = pst.s_transferCounter();

        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        uint256 thirdTransferId = pst.s_transferCounter();

        vm.stopPrank();

        // Assert
        assertEq(
            firstTransferId + 1,
            secondTransferId,
            "Second transfer ID should be first transfer ID + 1"
        );
        assertEq(
            secondTransferId + 1,
            thirdTransferId,
            "Third transfer ID should be second transfer ID + 1"
        );
    }

    function testCreateTransferUpdatesTransferPendingStateToTrue()
        public
        transferCreated
    {
        // Arrange / Act
        transferId = pst.s_transferCounter() - 1;
        bool pendingStatus = pst.s_isPending(transferId);

        // Assert
        assertTrue(pendingStatus, "Transfer state did not update to true");
    }

    function testCreateTransferUpdatesClaimedTransferIdsArray()
        public
        transferCreated
    {
        // Arrange
        uint256[] memory pendingTransfers = pst.getPendingTransfers();
        uint256 initialLength = pendingTransfers.length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        uint256[] memory updatedPendingTransfers = pst.getPendingTransfers();
        uint256 newLength = updatedPendingTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength + 1,
            "Pending transfer array length should increse by one"
        );
        assertEq(
            updatedPendingTransfers[newLength - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testCreateTransferUpdatesPendingTransfersByAddressForSenderAndReceiver()
        public
        transferCreated
    {
        // Arrange
        uint256[] memory pendingTransfersByAddressSender = pst
            .getPendingTransfersForAddress(SENDER);
        uint256 initialLengthSender = pendingTransfersByAddressSender.length;
        uint256[] memory pendingTransfersByAddressReceiver = pst
            .getPendingTransfersForAddress(RECEIVER);
        uint256 initialLengthReceiver = pendingTransfersByAddressReceiver
            .length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        uint256[] memory updatedPendingTransfersByAddressSender = pst
            .getPendingTransfersForAddress(SENDER);
        uint256 newLengthSender = updatedPendingTransfersByAddressSender.length;
        uint256[] memory updatedPendingTransfersByAddressReceiver = pst
            .getPendingTransfersForAddress(RECEIVER);
        uint256 newLengthReceiver = updatedPendingTransfersByAddressReceiver
            .length;

        // Assert
        assertEq(
            newLengthSender,
            initialLengthSender + 1,
            "Pending transfer for address array length should increase by one"
        );
        assertEq(
            updatedPendingTransfersByAddressSender[newLengthSender - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );

        assertEq(
            newLengthReceiver,
            initialLengthReceiver + 1,
            "Pending transfer for address array length should increse by one"
        );
        assertEq(
            updatedPendingTransfersByAddressSender[newLengthReceiver - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testCreateTransferAddsAddressToTracking() public {
        // Arrange
        bool tracking = pst.isAddressInTracking(SENDER);
        console.log("Is SENDER in tracking? ", tracking);

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        tracking = pst.isAddressInTracking(SENDER);

        // Assert
        assertTrue(tracking, "Adress is not in tracking");
    }

    function testCreateTransferUpdatesLastInteractionTime() public {
        // Arrange
        vm.expectEmit(true, true, false, false);
        emit LastInteractionTimeUpdated(SENDER, block.timestamp);

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );

        uint256 lastInteractionTime = pst.s_lastInteractionTime(SENDER);

        // Assert
        assertEq(
            lastInteractionTime,
            block.timestamp,
            "Last interaction time should be the same as block.timestamp"
        );
    }

    function testTransferCounterIncrementsCorrectly() public {
        // Arrange
        uint256 transferCounter = pst.s_transferCounter();

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferCounter = pst.s_transferCounter();

        // Assert
        assertEq(transferCounter, 1);
    }

    function testTotalTransferCostIsCorrect() public view {
        // Arrange
        uint256 expectedTotalTransferCost = totalTransferCost;

        // Act
        TransferFeeLibrary.TransferFee memory transferFees = pst
            .getTransferFees();
        uint256 transferFee = TransferFeeLibrary.selectTransferFee(
            AMOUNT_TO_SEND,
            LIMIT_LEVEL_ONE,
            LIMIT_LEVEL_TWO,
            transferFees
        );
        uint256 _transferFeeCost = (AMOUNT_TO_SEND * transferFee) /
            FEE_SCALING_FACTOR;
        uint256 _totalTransferCost = AMOUNT_TO_SEND + _transferFeeCost;

        // Assert
        assertEq(
            _totalTransferCost,
            expectedTotalTransferCost,
            "Total transfer cost is not calculated correctly"
        );
    }

    function testTransferFeeCostIsCorrect() public view {
        // Arrange
        uint256 expectedTransferFeeCost = transferFeeCost;

        // Act
        TransferFeeLibrary.TransferFee memory transferFees = pst
            .getTransferFees();
        uint256 transferFee = TransferFeeLibrary.selectTransferFee(
            AMOUNT_TO_SEND,
            LIMIT_LEVEL_ONE,
            LIMIT_LEVEL_TWO,
            transferFees
        );
        uint256 _transferFeeCost = (AMOUNT_TO_SEND * transferFee) /
            FEE_SCALING_FACTOR;

        // Assert
        assertEq(
            _transferFeeCost,
            expectedTransferFeeCost,
            "Transfer fee cost is not calculated correctly"
        );
    }

    function testCreateTransferRevertsForEthIfInsufficientFunds() public {
        // Arange
        address IA_SENDER = makeAddr("invalid amount sender");
        uint256 INVALID_AMOUNT = 0.5 ether;
        vm.deal(IA_SENDER, INVALID_AMOUNT);

        // Act / Assert
        vm.expectRevert(
            abi.encodeWithSelector(
                PST.PST__InvalidAmountSent.selector,
                totalTransferCost,
                INVALID_AMOUNT
            )
        );
        vm.prank(IA_SENDER);
        pst.createTransfer{value: INVALID_AMOUNT}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    /**
     * @dev Need to comment "receive() external payable {}" in PST.sol contract for this to pass
     */
    // function testCreateTransferRevertsIfEthTransferFails() public {
    //     // Arange / Act / Assert
    //     vm.expectRevert(PST.PST__TransferFailed.selector);
    //     vm.prank(SENDER);
    //     pst.createTransfer{value: totalTransferCost}(RECEIVER, address(0), AMOUNT_TO_SEND, PASSWORD);
    // }

    function testCreateTransferSendsEthToPSTContract() public {
        // Arange
        uint256 beforeBalance = pst.getBalance();
        uint256 expectedAfterBalance = beforeBalance + totalTransferCost;

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        uint256 afterBalance = pst.getBalance();

        // Assert
        assertEq(
            afterBalance,
            expectedAfterBalance,
            "PST contract didn't receive the correct amount of ETH when createTransfer was called"
        );
    }

    function testCreateTransferRevertsForErc20IfInsufficientFunds() public {
        // Arange
        address IA_SENDER = makeAddr("insufficient amount sender");
        uint256 INSUFFICIENT_AMOUNT = 0.5 ether;
        vm.deal(IA_SENDER, 100 ether);
        mockERC20Token.transfer(IA_SENDER, INSUFFICIENT_AMOUNT);
        vm.deal(IA_SENDER, 100 ether);

        // Act / Assert
        vm.expectRevert(
            abi.encodeWithSelector(
                PST.PST__NotEnoughFunds.selector,
                totalTransferCost,
                INSUFFICIENT_AMOUNT
            )
        );
        vm.prank(IA_SENDER);
        pst.createTransfer{value: INSUFFICIENT_AMOUNT}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    function testCreateTransferRevertsIfErc20TransferFails() public {
        // Arange
        FailingERC20Mock_ForCreateTransferTest failingERC20Mock = new FailingERC20Mock_ForCreateTransferTest(
                "FailingERC20MockToken",
                "FAILERC20MOCK",
                1e6 ether
            );
        failingERC20Mock.transfer(SENDER, 100 ether);
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(failingERC20Mock));

        // Act / Assert
        vm.expectRevert(PST.PST__TransferFailed.selector);
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(failingERC20Mock),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    function testCreateTransferSendsERC20TokenToPSTContract() public {
        // Arange
        uint256 beforeBalance = mockERC20Token.balanceOf(address(pst));
        uint256 expectedAfterBalance = beforeBalance + totalTransferCost;

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        uint256 afterBalance = mockERC20Token.balanceOf(address(pst));

        // Assert
        assertEq(
            afterBalance,
            expectedAfterBalance,
            "PST contract didn't receive the correct amount of ERC20Token when createTransfer was called"
        );
    }

    /*//////////////////////////////////////////////////////////////
                        CANCEL TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/
    function testCancelTransferRevertsIfCallerIsNotSender() public {
        // Arrange
        address NOT_SENDER = makeAddr("not sender");
        vm.deal(NOT_SENDER, SENDER_BALANCE);

        // Act / Assert
        vm.expectRevert(PST.PST__OnlySenderCanCancel.selector);
        vm.prank(NOT_SENDER);
        pst.cancelTransfer(transferId);
    }

    function testCancelTransferRevertsIfTransferIsNotPending() public {
        // Arrange
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

        // Act / Assert
        vm.prank(SENDER);
        vm.expectRevert(PST.PST__TransferNotPending.selector);
        pst.cancelTransfer(transferId);
    }

    // function testCancelTransferRevertsIfTransferIdIsInvalid() public {
    //     // Arrange
    //     transferId = 9999;
    //     vm.prank(SENDER);
    //     pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
    //     console.log(transferId);
    //     transferId = pst.s_transferCounter() - 1;
    //     console.log(transferId);

    //     // Act / Assert
    //     vm.prank(SENDER);
    //     vm.expectRevert(PST.PST__InvalidTransferId.selector);
    //     pst.cancelTransfer(transferId);
    // }

    function testCancelTransferUpdatesTransferPendingStateToFalse()
        public
        transferCreatedAndCanceled
    {
        // Arrange / Act
        bool pendingStatus = pst.s_isPending(transferId);

        // Assert
        assertFalse(pendingStatus, "Transfer state did not update to false");
    }

    function testCancelTransferUpdatesTransferCanceledStateToTrue()
        public
        transferCreatedAndCanceled
    {
        // Arrange / Act
        bool canceledStatus = pst.s_isCanceled(transferId);

        // Assert
        assertTrue(canceledStatus, "Transfer state did not update to true");
    }

    function testCancelTransferUpdatesTransferAmountToZero()
        public
        transferCreatedAndCanceled
    {
        // Arrange / Act
        (, , , uint256 transferAmount, , , ) = pst.s_transfersById(transferId);

        // Assert
        assertEq(transferAmount, 0, "Transfer amount should be zero");
    }

    function testCancelTransferUpdatesCanceledTransferIdsArray()
        public
        transferCreatedAndCanceled
    {
        // Arrange
        uint256[] memory canceledTransfers = pst.getCanceledTransfers();
        uint256 initialLength = canceledTransfers.length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
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

        uint256[] memory updatedCanceledTransfers = pst.getCanceledTransfers();
        uint256 newLength = updatedCanceledTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength + 1,
            "Canceled transfer array length should increse by one"
        );
        assertEq(
            updatedCanceledTransfers[newLength - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testCancelTransferRemovesTransferIdfromPendingTransfersArray()
        public
        transferCreated
    {
        // Arrange
        uint256[] memory pendingTransfers = pst.getPendingTransfers();
        uint256 initialLength = pendingTransfers.length;

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        // Act
        vm.prank(SENDER);
        pst.cancelTransfer(transferId);

        uint256[] memory updatedPendingTransfers = pst.getPendingTransfers();
        uint256 newLength = updatedPendingTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength,
            "Pending transfers array length should decrease by one"
        );
        for (uint256 i = 0; i < newLength; i++) {
            assertFalse(
                updatedPendingTransfers[i] == transferId,
                "Transfer ID should be removed from pending list"
            );
        }
    }

    function testCancelTransferRemovesTransferIdfromPendingTransfersByAddressForSenderAndReceiver()
        public
        transferCreated
    {
        // Arrange
        uint256[] memory senderPendingTransfers = pst
            .getPendingTransfersForAddress(SENDER);
        uint256 initialSenderLength = senderPendingTransfers.length;

        uint256[] memory receiverPendingTransfers = pst
            .getPendingTransfersForAddress(RECEIVER);
        uint256 initialReceiverLength = receiverPendingTransfers.length;

        // Act
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

        uint256[] memory updatedSenderPendingTransfers = pst
            .getPendingTransfersForAddress(SENDER);
        uint256[] memory updatedReceiverPendingTransfers = pst
            .getPendingTransfersForAddress(RECEIVER);

        // Assert
        assertEq(
            updatedSenderPendingTransfers.length,
            initialSenderLength,
            "Sender's pending transfers should decrease by one"
        );
        assertEq(
            updatedReceiverPendingTransfers.length,
            initialReceiverLength,
            "Receiver's pending transfers should decrease by one"
        );

        for (uint256 i = 0; i < updatedSenderPendingTransfers.length; i++) {
            assertFalse(
                updatedSenderPendingTransfers[i] == transferId,
                "Transfer ID should be removed from sender's pending list"
            );
        }

        for (uint256 i = 0; i < updatedReceiverPendingTransfers.length; i++) {
            assertFalse(
                updatedReceiverPendingTransfers[i] == transferId,
                "Transfer ID should be removed from receiver's pending list"
            );
        }
    }

    function testCancelTransferUpdatesLastInteractionTime()
        public
        transferCreated
    {
        // Arrange
        vm.expectEmit(true, true, false, false);
        emit LastInteractionTimeUpdated(SENDER, block.timestamp);

        // Act
        transferId = pst.s_transferCounter() - 1;
        vm.prank(SENDER);
        pst.cancelTransfer(transferId);
        uint256 lastInteractionTime = pst.s_lastInteractionTime(SENDER);

        // Assert
        assertEq(
            lastInteractionTime,
            block.timestamp,
            "Last interaction time should be the same as block.timestamp"
        );
    }

    function testCancelTransferRefundsEthToSender() public {
        // Arrange
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        uint256 senderBalanceBefore = SENDER.balance;
        transferId = pst.s_transferCounter() - 1;

        // Act
        vm.prank(SENDER);
        pst.cancelTransfer(transferId);
        uint256 senderBalanceAfter = SENDER.balance;

        // Assert
        assertEq(
            senderBalanceAfter,
            senderBalanceBefore + AMOUNT_TO_SEND,
            "Sender should be refunded the transferred ETH amount"
        );
    }

    function testCancelTransferRevertsIfEthRefundFails() public {
        // Arrange
        NonPayableContractMock nonPayable = new NonPayableContractMock();
        vm.deal(address(nonPayable), SENDER_BALANCE);
        vm.prank(address(nonPayable));
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        // Act & Assert
        vm.prank(address(nonPayable));
        vm.expectRevert(PST.PST__TransferFailed.selector);
        pst.cancelTransfer(transferId);
    }

    function testCancelTransferRefundsErc20TokenToSender()
        public
        transferCreated
    {
        // Arrange
        uint256 senderBalanceBefore = mockERC20Token.balanceOf(SENDER);
        transferId = pst.s_transferCounter() - 1;

        // Act
        vm.prank(SENDER);
        pst.cancelTransfer(transferId);
        uint256 senderBalanceAfter = mockERC20Token.balanceOf(SENDER);

        // Assert
        assertEq(
            senderBalanceAfter,
            senderBalanceBefore + AMOUNT_TO_SEND,
            "Sender should be refunded the transferred ERC20 token amount"
        );
    }

    function testCancelTransferRevertsIfErc20TokenRefundFails() public {
        // Arrange
        vm.startPrank(SENDER);
        FailingERC20Mock_ForCancelAndClaimTransferTest failingERC20Mock = new FailingERC20Mock_ForCancelAndClaimTransferTest(
                "FailingERC20MockToken",
                "FAILERC20MOCK",
                1e6 ether
            );
        failingERC20Mock.approve(address(pst), 100 ether);
        vm.stopPrank();
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(failingERC20Mock));

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(failingERC20Mock),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        // Assert
        vm.prank(SENDER);
        vm.expectRevert(PST.PST__TransferFailed.selector);
        pst.cancelTransfer(transferId);
    }

    /*//////////////////////////////////////////////////////////////
                        CLAIM TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/
    function testClaimTransferRevertsIfClaimCooldownNotElapsed()
        public
        transferCreated
    {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__CooldownPeriodNotElapsed.selector);
        vm.prank(SENDER);
        pst.claimTransfer(transferId, PASSWORD);
    }

    function testClaimTransferRevertsIfTransferNotPending()
        public
        transferCreatedAndCanceled
    {
        // Arrange
        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act / Assert
        vm.expectRevert(PST.PST__TransferNotPending.selector);
        vm.prank(SENDER);
        pst.claimTransfer(transferId, PASSWORD);
    }

    function testClaimTransferRevertsWhenReceiverisNotMsgSender()
        public
        transferCreated
    {
        // Arrange
        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act / Assert
        vm.expectRevert(PST.PST__InvalidReceiver.selector);
        vm.prank(SENDER);
        pst.claimTransfer(transferId, PASSWORD);
    }

    function testClaimTransferRevertsIfPasswordNotProvided()
        public
        transferCreated
    {
        // Arrange
        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act / Assert
        vm.expectRevert(PST.PST__PasswordNotProvided.selector);
        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, "");
    }

    function testClaimTransferRevertsIfPasswordIsTooShort()
        public
        transferCreated
    {
        // Arrange
        uint256 MIN_PASSWORD_LENGTH = pst.s_minPasswordLength();
        string memory SHORT_PASSWORD = "NoGood";

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act // Assert
        vm.expectRevert(
            abi.encodeWithSelector(
                PST.PST__PasswordTooShort.selector,
                MIN_PASSWORD_LENGTH
            )
        );
        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, SHORT_PASSWORD);
    }

    function testClaimTransferRevertsIfPasswordIsIncorrect()
        public
        transferCreated
    {
        // Arrange
        string memory INCORRECT_PASSWORD = "IncorrectPassword";

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act // Assert
        vm.expectRevert(PST.PST__IncorrectPassword.selector);
        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, INCORRECT_PASSWORD);
    }

    function testClaimTransferUpdatesTransferPendingStateToFalse()
        public
        transferCreatedAndClaimed
    {
        // Arrange / Act / Assert
        bool pendingStatus = pst.s_isPending(transferId);
        assertFalse(pendingStatus, "Transfer state did not update to false");
    }

    function testClaimTransferUpdatesTransferClaimedStateToTrue()
        public
        transferCreatedAndClaimed
    {
        // Arrange / Act / Assert
        bool claimedStatus = pst.s_isClaimed(transferId);
        assertTrue(claimedStatus, "Transfer state did not update to true");
    }

    function testClaimTransferUpdatesTransferAmountToZero()
        public
        transferCreatedAndClaimed
    {
        // Arrange / Act
        (, , , uint256 transferAmount, , , ) = pst.s_transfersById(transferId);

        // Assert
        assertEq(transferAmount, 0, "Transfer amount should be zero");
    }

    function testClaimTransferUpdatesClaimedTransferIdsArray()
        public
        transferCreatedAndClaimed
    {
        // Arrange
        uint256[] memory claimedTransfers = pst.getClaimedTransfers();
        uint256 initialLength = claimedTransfers.length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
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

        uint256[] memory updatedClaimedTransfers = pst.getClaimedTransfers();
        uint256 newLength = updatedClaimedTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength + 1,
            "Claimed transfer array length should increse by one"
        );
        assertEq(
            updatedClaimedTransfers[newLength - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testClaimTransferUpdatesClaimedTransfersByAddressForSenderAndReceiver()
        public
        transferCreatedAndClaimed
    {
        // Arrange
        uint256[] memory claimedTransfersByAddressSender = pst
            .getClaimedTransfersForAddress(SENDER);
        uint256 initialLengthSender = claimedTransfersByAddressSender.length;
        uint256[] memory claimedTransfersByAddressReceiver = pst
            .getClaimedTransfersForAddress(RECEIVER);
        uint256 initialLengthReceiver = claimedTransfersByAddressReceiver
            .length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
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

        uint256[] memory updatedClaimedTransfersByAddressSender = pst
            .getClaimedTransfersForAddress(SENDER);
        uint256 newLengthSender = updatedClaimedTransfersByAddressSender.length;
        uint256[] memory updatedClaimedTransfersByAddressReceiver = pst
            .getClaimedTransfersForAddress(RECEIVER);
        uint256 newLengthReceiver = updatedClaimedTransfersByAddressReceiver
            .length;

        // Assert
        assertEq(
            newLengthSender,
            initialLengthSender + 1,
            "Claimed transfer for address array length should increase by one"
        );
        assertEq(
            updatedClaimedTransfersByAddressSender[newLengthSender - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );

        assertEq(
            newLengthReceiver,
            initialLengthReceiver + 1,
            "Claimed transfer for address array length should increse by one"
        );
        assertEq(
            updatedClaimedTransfersByAddressReceiver[newLengthReceiver - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testClaimTransferRemovesTransferIdfromPendingTransfersArray()
        public
        transferCreated
    {
        // Arrange
        uint256[] memory pendingTransfers = pst.getPendingTransfers();
        uint256 initialLength = pendingTransfers.length;

        // Act
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

        uint256[] memory updatedPendingTransfers = pst.getPendingTransfers();
        uint256 newLength = updatedPendingTransfers.length;

        // Assert
        assertEq(
            newLength,
            initialLength,
            "Pending transfers array length should decrease by one"
        );
        for (uint256 i = 0; i < newLength; i++) {
            assertFalse(
                updatedPendingTransfers[i] == transferId,
                "Transfer ID should be removed from pending list"
            );
        }
    }

    function testClaimTransferRemovesTransferIdfromPendingTransfersByAddressForSenderAndReceiver()
        public
        transferCreated
    {
        // Arrange
        uint256[] memory senderPendingTransfers = pst
            .getPendingTransfersForAddress(SENDER);
        uint256 initialSenderLength = senderPendingTransfers.length;
        console.log(initialSenderLength);

        uint256[] memory receiverPendingTransfers = pst
            .getPendingTransfersForAddress(RECEIVER);
        uint256 initialReceiverLength = receiverPendingTransfers.length;

        // Act
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

        uint256[] memory updatedSenderPendingTransfers = pst
            .getPendingTransfersForAddress(SENDER);
        uint256[] memory updatedReceiverPendingTransfers = pst
            .getPendingTransfersForAddress(RECEIVER);

        // Assert
        assertEq(
            updatedSenderPendingTransfers.length,
            initialSenderLength,
            "Sender's pending transfers should decrease by one"
        );
        assertEq(
            updatedReceiverPendingTransfers.length,
            initialReceiverLength,
            "Receiver's pending transfers should decrease by one"
        );

        for (uint256 i = 0; i < updatedSenderPendingTransfers.length; i++) {
            assertFalse(
                updatedSenderPendingTransfers[i] == transferId,
                "Transfer ID should be removed from sender's pending list"
            );
        }

        for (uint256 i = 0; i < updatedReceiverPendingTransfers.length; i++) {
            assertFalse(
                updatedReceiverPendingTransfers[i] == transferId,
                "Transfer ID should be removed from receiver's pending list"
            );
        }
    }

    function testClaimTransferAddsAddressToTracking() public {
        // Arrange
        bool tracking = pst.isAddressInTracking(RECEIVER);
        console.log("Is RECEIVER in tracking? ", tracking);

        // Act
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

        tracking = pst.isAddressInTracking(RECEIVER);

        // Assert
        assertTrue(tracking, "Adress is not in tracking");
    }

    function testClaimTransferUpdatesLastInteractionTime()
        public
        transferCreated
    {
        // Arrange / Act
        transferId = pst.s_transferCounter() - 1;
        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        vm.expectEmit(true, true, false, false);
        emit LastInteractionTimeUpdated(RECEIVER, block.timestamp);

        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);

        uint256 lastInteractionTime = pst.s_lastInteractionTime(RECEIVER);

        // Assert
        assertEq(
            lastInteractionTime,
            block.timestamp,
            "Last interaction time should be the same as block.timestamp"
        );
    }

    function testClaimTransferSendsEthToReceiver() public {
        // Arrange
        vm.prank(SENDER);
        uint256 receiverBalanceBefore = RECEIVER.balance;
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act
        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);

        uint256 receiverBalanceAfter = RECEIVER.balance;

        // Assert
        assertEq(
            receiverBalanceAfter,
            receiverBalanceBefore + AMOUNT_TO_SEND,
            "Receiver ETH balance should updated with the sent amount"
        );
    }

    function testClaimTransferRevertsIfEthTransferToReceiverFails() public {
        // Arrange
        NonPayableContractMock nonPayable = new NonPayableContractMock();

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            address(nonPayable),
            address(0),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act & Assert
        vm.prank(address(nonPayable));
        vm.expectRevert(PST.PST__TransferFailed.selector);
        pst.claimTransfer(transferId, PASSWORD);
    }

    function testClaimTransferSendsErc20TokenToReceiver()
        public
        transferCreated
    {
        // Arrange
        uint256 receiverBalanceBefore = mockERC20Token.balanceOf(RECEIVER);
        transferId = pst.s_transferCounter() - 1;

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act
        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);
        uint256 receiverBalanceAfter = mockERC20Token.balanceOf(RECEIVER);

        // Assert
        assertEq(
            receiverBalanceAfter,
            receiverBalanceBefore + AMOUNT_TO_SEND,
            "Receiver ERC20 balance should updated with the sent amount"
        );
    }

    function testClaimTransferRevertsIfErc20TokenTransferToReceiverFails()
        public
    {
        // Arrange
        vm.startPrank(SENDER);
        FailingERC20Mock_ForCancelAndClaimTransferTest failingERC20Mock = new FailingERC20Mock_ForCancelAndClaimTransferTest(
                "FailingERC20MockToken",
                "FAILERC20MOCK",
                1e6 ether
            );
        failingERC20Mock.approve(address(pst), 100 ether);
        vm.stopPrank();
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(failingERC20Mock));

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(failingERC20Mock),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        transferId = pst.s_transferCounter() - 1;

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Assert
        vm.prank(RECEIVER);
        vm.expectRevert(PST.PST__TransferFailed.selector);
        pst.claimTransfer(transferId, PASSWORD);
    }

    /*//////////////////////////////////////////////////////////////
                        PASSWORD TESTS
    //////////////////////////////////////////////////////////////*/

    function testEncodePassword() public transferCreated {
        // Arrange
        (, , , , , , bytes32 encodedPassword) = pst.s_transfersById(transferId);

        // Act
        bytes32 hashedPassword = pst.encodePassword(transferId, PASSWORD);

        // Assert
        assertEq(
            encodedPassword,
            hashedPassword,
            "Password hashes should match"
        );
    }

    function testPasswordEncodingWithSalt() public transferCreated {
        // Arrange
        transferId = pst.s_transferCounter() - 1;
        (
            address sender,
            address receiver,
            ,
            ,
            ,
            ,
            bytes32 encodedPassword
        ) = pst.s_transfersById(transferId);
        bytes32 salt = keccak256(
            abi.encodePacked(transferId, sender, receiver)
        );

        // Act
        bytes32 expectedEncodedPassword = keccak256(
            abi.encodePacked(PASSWORD, salt)
        );

        // Assert
        assertEq(
            encodedPassword,
            expectedEncodedPassword,
            "Password encoding not correct"
        );
    }

    function testPasswordEncodingForDiffSalts() public transferCreated {
        // Arrange / Act
        (
            address sender1,
            address receiver1,
            ,
            ,
            ,
            ,
            bytes32 encodedPassword1
        ) = pst.s_transfersById(transferId);
        bytes32 salt1 = keccak256(
            abi.encodePacked(transferId, sender1, receiver1)
        );

        transferId = pst.s_transferCounter();
        vm.warp(block.timestamp + 1);
        vm.roll(block.number + 1);

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
        (
            address sender2,
            address receiver2,
            ,
            ,
            ,
            ,
            bytes32 encodedPassword2
        ) = pst.s_transfersById(transferId);
        bytes32 salt2 = keccak256(
            abi.encodePacked(transferId, sender2, receiver2)
        );

        // Assert
        assertFalse(
            salt1 == salt2,
            "Salts should be different for different transfer Ids"
        );
        assertFalse(
            encodedPassword1 == encodedPassword2,
            "Encoded passwords should be different due to different salts"
        );
    }

    function testCheckPassword() public transferCreated {
        // Arrange / Act
        bool correctPassword = pst.checkPassword(transferId, "Strongpass");

        // Assert
        assertTrue(correctPassword, "Entered password is not correct");
    }
}

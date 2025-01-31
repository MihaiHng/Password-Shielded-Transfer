// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";
import {FailingERC20Mock} from "../mocks/FailingERC20Mock.sol";

contract TestPST is Test {
    PST public pst;
    ERC20Mock public mockERC20Token;

    uint256 public totalTransferCost;
    uint256 public transferFeeCost;
    uint256 public transferId;

    // Constants for fee levels
    uint8 private constant LVL1 = 1;
    uint8 private constant LVL2 = 2;
    uint8 private constant LVL3 = 3;
    uint256 private constant TRANSFER_FEE_LVL_ONE = 1000; // 0.1% for <= LIMIT_LEVEL_ONE
    uint256 private constant TRANSFER_FEE_LVL_TWO = 100; // 0.01% for > LIMIT_LEVEL_ONE and <= LIMIT_LEVEL_TWO
    uint256 private constant TRANSFER_FEE_LVL_THREE = 10; // 0.001% for > LIMIT_LEVEL_TWO
    uint256 private constant AMOUNT_LVL_ONE = 5 ether;
    uint256 private constant AMOUNT_LVL_TWO = 50 ether;
    uint256 private constant AMOUNT_LVL_THREE = 150 ether;
    uint256 private constant LIMIT_LEVEL_ONE = 10e18;
    uint256 private constant LIMIT_LEVEL_TWO = 100e18;
    uint256 private constant FEE_SCALING_FACTOR = 10e6;
    uint256 private constant AMOUNT_TO_SEND = 1 ether;

    string private constant PASSWORD = "Strongpass";

    address public SENDER = makeAddr("sender");
    address public RECEIVER = makeAddr("receiver");
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;

    event LastInteractionTimeUpdated(address indexed user, uint256 indexed lastInteractionTime);

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();
        mockERC20Token = new ERC20Mock("ERC20MockToken", "ERC20MOCK", 1e6 ether);

        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(mockERC20Token));

        vm.deal(SENDER, SENDER_BALANCE);
        mockERC20Token.transfer(SENDER, 100 ether);

        (totalTransferCost, transferFeeCost) = TransferFeeLibrary.calculateTotalTransferCost(
            AMOUNT_TO_SEND, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, pst.getFee()
        );

        vm.prank(SENDER);
        mockERC20Token.approve(address(pst), 100 ether);

        transferId = pst.s_transferCounter();
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
                               FEE TESTS
    //////////////////////////////////////////////////////////////*/
    function testInitialTransferFee() public view {
        // Arrange // Act
        uint256 transferFeeLvlOne = pst.getTransferFee(LVL1);
        uint256 transferFeeLvlTWo = pst.getTransferFee(LVL2);
        uint256 transferFeeLvlThree = pst.getTransferFee(LVL3);

        // Assert
        assertEq(transferFeeLvlOne, TRANSFER_FEE_LVL_ONE, "Fee level 1 is incorrect");
        assertEq(transferFeeLvlTWo, TRANSFER_FEE_LVL_TWO, "Fee level 2 is incorrect");
        assertEq(transferFeeLvlThree, TRANSFER_FEE_LVL_THREE, "Fee level 3 is incorrect");
    }

    function testTransferFeeCalculation() public view {
        // Arrange
        uint256 expectedFeeLevelOne = (AMOUNT_LVL_ONE * TRANSFER_FEE_LVL_ONE) / FEE_SCALING_FACTOR;
        uint256 expectedFeeLevelTwo = (AMOUNT_LVL_TWO * TRANSFER_FEE_LVL_TWO) / FEE_SCALING_FACTOR;
        uint256 expectedFeeLevelThree = (AMOUNT_LVL_THREE * TRANSFER_FEE_LVL_THREE) / FEE_SCALING_FACTOR;

        // Act
        (, uint256 feeLevelOne) = pst.calculateTotalTransferCostPublic(AMOUNT_LVL_ONE);
        (, uint256 feeLevelTwo) = pst.calculateTotalTransferCostPublic(AMOUNT_LVL_TWO);
        (, uint256 feeLevelThree) = pst.calculateTotalTransferCostPublic(AMOUNT_LVL_THREE);

        // Assert
        assertEq(expectedFeeLevelOne, feeLevelOne, "Incorrect fee for level one");
        assertEq(expectedFeeLevelTwo, feeLevelTwo, "Incorrect fee for level two");
        assertEq(expectedFeeLevelThree, feeLevelThree, "Incorrect fee for level three");
    }

    function testSelectTransferFee() public view {
        // Arrange
        (uint256 lvlOne, uint256 lvlTwo, uint256 lvlThree) = pst.fee();

        TransferFeeLibrary.TransferFee memory transferFees =
            TransferFeeLibrary.TransferFee({lvlOne: lvlOne, lvlTwo: lvlTwo, lvlThree: lvlThree});

        // Act
        uint256 transferFeeLvlOne = TransferFeeLibrary.selectTransferFee(
            AMOUNT_LVL_ONE, pst.s_limitLevelOne(), pst.s_limitLevelTwo(), transferFees
        );
        uint256 transferFeeLvlTwo = TransferFeeLibrary.selectTransferFee(
            AMOUNT_LVL_TWO, pst.s_limitLevelOne(), pst.s_limitLevelTwo(), transferFees
        );
        uint256 transferFeeLvlThree = TransferFeeLibrary.selectTransferFee(
            AMOUNT_LVL_THREE, pst.s_limitLevelOne(), pst.s_limitLevelTwo(), transferFees
        );

        // Assert
        assertEq(transferFeeLvlOne, TRANSFER_FEE_LVL_ONE, "Incorrect transfer fee level one");
        assertEq(transferFeeLvlTwo, TRANSFER_FEE_LVL_TWO, "Incorrect transfer fee level two");
        assertEq(transferFeeLvlThree, TRANSFER_FEE_LVL_THREE, "Incorrect transfer fee level three");
    }

    function testFeesAccumulateCorrectly() public {
        // Arrange
        uint256 expectedAccumulatedFee;

        vm.startPrank(SENDER);
        mockERC20Token.approve(address(pst), 10 ether);

        (uint256 lvlOne, uint256 lvlTwo, uint256 lvlThree) = pst.fee();

        TransferFeeLibrary.TransferFee memory transferFees =
            TransferFeeLibrary.TransferFee({lvlOne: lvlOne, lvlTwo: lvlTwo, lvlThree: lvlThree});

        // Act
        (uint256 totalTransferCost1, uint256 transferFeeCost1) = TransferFeeLibrary.calculateTotalTransferCost(
            AMOUNT_TO_SEND, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, transferFees
        );
        pst.createTransfer{value: totalTransferCost1}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
        expectedAccumulatedFee += transferFeeCost1;

        (uint256 totalTransferCost2, uint256 transferFeeCost2) = TransferFeeLibrary.calculateTotalTransferCost(
            AMOUNT_TO_SEND, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, transferFees
        );
        pst.createTransfer{value: totalTransferCost2}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
        expectedAccumulatedFee += transferFeeCost2;

        uint256 accumulatedFee = pst.getAccumulatedFeesForToken(address(mockERC20Token));
        vm.stopPrank();

        // Assert
        assertEq(accumulatedFee, expectedAccumulatedFee, "Accumulated fees not correct");
    }

    function testSetNewTransferFee() public {
        // Arrange
        uint256 newTransferFeeLvlOne = 10000;
        uint256 newTransferFeeLvlTwo = 1000;
        uint256 newTransferFeeLvlThree = 100;

        // Act
        vm.startPrank(pst.owner());
        pst.setTransferFee(LVL1, newTransferFeeLvlOne);
        pst.setTransferFee(LVL2, newTransferFeeLvlTwo);
        pst.setTransferFee(LVL3, newTransferFeeLvlThree);
        vm.stopPrank();

        uint256 transferFeeLvlOne = pst.getTransferFee(LVL1);
        uint256 transferFeeLvlTwo = pst.getTransferFee(LVL2);
        uint256 transferFeeLvlThree = pst.getTransferFee(LVL3);

        // Assert
        assertEq(transferFeeLvlOne, newTransferFeeLvlOne, "Setting new transfer fee level one not correct");
        assertEq(transferFeeLvlTwo, newTransferFeeLvlTwo, "Setting new transfer fee level two not correct");
        assertEq(transferFeeLvlThree, newTransferFeeLvlThree, "Setting new transfer fee level three not correct");
    }

    function testSetNewTransferFeeLimitOne() public {
        // Arrange
        uint256 newTransferFeeLimitLvlOne = 15e18;

        // Act
        vm.prank(pst.owner());
        pst.setNewLimitLevelOne(newTransferFeeLimitLvlOne);
        uint256 transferFeeLimitLvlOne = pst.s_limitLevelOne();

        // Assert
        assertEq(transferFeeLimitLvlOne, newTransferFeeLimitLvlOne, "Setting new transfer fee limit one not correct");
    }

    function testSetNewTransferFeeLimitTwo() public {
        // Arrange
        uint256 newTransferFeeLimitLvlTwo = 150e18;

        // Act
        vm.prank(pst.owner());
        pst.setNewLimitLevelTwo(newTransferFeeLimitLvlTwo);
        uint256 transferFeeLimitLvlTwo = pst.s_limitLevelTwo();

        // Assert
        assertEq(transferFeeLimitLvlTwo, newTransferFeeLimitLvlTwo, "Setting new transfer fee limit two not correct");
    }

    function testSetNewFeeScallingFactor() public {
        // Arrange
        uint256 newFeeScallingFactor = 10e7;

        // Act
        vm.prank(pst.owner());
        pst.setNewFeeScalingFactor(newFeeScallingFactor);
        uint256 feeScalingFactor = pst.s_feeScalingFactor();

        // Assert
        assertEq(feeScalingFactor, newFeeScallingFactor, "Setting new fee scalling factor not correct");
    }

    function testGetTransferFeeWorksCorrectly() public view {
        // Arrange // Act
        uint256 transferFeeLvlOne = pst.getTransferFee(LVL1);
        uint256 transferFeeLvlTwo = pst.getTransferFee(LVL2);
        uint256 transferFeeLvlThree = pst.getTransferFee(LVL3);

        // Assert
        assertEq(transferFeeLvlOne, TRANSFER_FEE_LVL_ONE, "Incorrect transfer fee level one");
        assertEq(transferFeeLvlTwo, TRANSFER_FEE_LVL_TWO, "Incorrect transfer fee level two");
        assertEq(transferFeeLvlThree, TRANSFER_FEE_LVL_THREE, "Incorrect transfer fee level three");
    }

    /*//////////////////////////////////////////////////////////////
                        CREATE TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    function testCreateTransferRevertsWhenAmountIsNotMoreThanZero() public {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__NeedsMoreThanZero.selector);
        pst.createTransfer(RECEIVER, address(mockERC20Token), 0, PASSWORD);
    }

    function testCreateTransferRevertsWhenReceiverIsNotValid() public {
        // Arrange
        address INVALID_RECEIVER = address(0);

        // Act // Assert
        vm.expectRevert(PST.PST__InvalidAddress.selector);
        pst.createTransfer(INVALID_RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
    }

    function testCreateTransferRevertsWhenTokenNotAllowed() public {
        // Arrange
        ERC20Mock na_mockERC20Token = new ERC20Mock("NotAllowedERC20MockToken", "NAERC20MOCK", 1e6 ether);
        na_mockERC20Token.transfer(SENDER, 100 ether);

        // Act // Assert
        vm.expectRevert(PST.PST__TokenNotAllowed.selector);
        pst.createTransfer(RECEIVER, address(na_mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
    }

    function testCreateTransferRevertsWhenSendingToOWnAddress() public {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__CantSendToOwnAddress.selector);
        vm.prank(SENDER);
        pst.createTransfer(SENDER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
    }

    function testCreateTransferRevertsWhenPasswordNotProvided() public {
        // Arrange / Act / Assert
        vm.expectRevert(PST.PST__PasswordNotProvided.selector);
        pst.createTransfer(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, "");
    }

    function testCreateTransferRevertsWhenPasswordIsToShort() public {
        // Arrange
        uint256 MIN_PASSWORD_LENGTH = 7;
        string memory SHORT_PASSWORD = "NoGood";

        // Act // Assert
        vm.expectRevert(abi.encodeWithSelector(PST.PST__PasswordTooShort.selector, MIN_PASSWORD_LENGTH));
        pst.createTransfer(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, SHORT_PASSWORD);
    }

    function testCreateTransferStoresTransferDetails() public {
        // Arrange / Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        transferId = pst.s_transferCounter() - 1;

        (
            address sender,
            address receiver,
            address token,
            uint256 amount,
            uint256 creationTime,
            uint256 expiringTime,
            bytes32 encodedPassword,
            bytes32 storedSalt
        ) = pst.s_transfersById(transferId);

        bytes32 salt = storedSalt;
        bytes32 passwordHash = keccak256(abi.encodePacked(PASSWORD, salt));

        // Assert
        assertEq(sender, SENDER, "Sender address should match");
        assertEq(receiver, RECEIVER, "Receiver address should match");
        assertEq(token, address(mockERC20Token), "Token address should match");
        assertEq(amount, AMOUNT_TO_SEND, "Transfer amount should match");
        assertGt(creationTime, 0, "Creation time should be set");
        assertGt(expiringTime, 0, "Expiring time should be set");
        assertEq(encodedPassword, passwordHash, "Stored password hash should match");
        assertEq(storedSalt, salt, "Stored salt should match");
    }

    function testCreateTransferGeneratesSequentialIds() public {
        // Arrange
        uint256 firstTransferId = pst.s_transferCounter();

        // Act
        vm.startPrank(SENDER);

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        uint256 secondTransferId = pst.s_transferCounter();

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        uint256 thirdTransferId = pst.s_transferCounter();

        vm.stopPrank();

        // Assert
        assertEq(firstTransferId + 1, secondTransferId, "Second transfer ID should be first transfer ID + 1");
        assertEq(secondTransferId + 1, thirdTransferId, "Third transfer ID should be second transfer ID + 1");
    }

    function testCreateTransferUpdatesPendingStateToTrue() public {
        // Arrange / Act
        vm.prank(SENDER);

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
        transferId = pst.s_transferCounter() - 1;
        bool pendingStatus = pst.s_isPending(transferId);

        // Assert
        assertTrue(pendingStatus, "Transfer state did not update to true");
    }

    function testCreateTransferUpdatesPendingTransferIdsArray() public {
        // Arrange
        uint256[] memory pendingTransfers = pst.getPendingTransfers();
        uint256 initialLength = pendingTransfers.length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
        vm.prank(SENDER);

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        uint256[] memory updatedPendingTransfers = pst.getPendingTransfers();
        uint256 newLength = updatedPendingTransfers.length;

        // Assert
        assertEq(newLength, initialLength + 1, "Pending transfer array length should increse by one");
        assertEq(
            updatedPendingTransfers[newLength - 1],
            expectedTransferId,
            "Last element should be the newly created transfer Id"
        );
    }

    function testCreateTransferUpdatesPendingTransfersByAddressForSenderAndReceiver() public {
        // Arrange
        uint256[] memory pendingTransfersByAddressSender = pst.getPendingTransfersForAddress(SENDER);
        uint256 initialLengthSender = pendingTransfersByAddressSender.length;
        uint256[] memory pendingTransfersByAddressReceiver = pst.getPendingTransfersForAddress(RECEIVER);
        uint256 initialLengthReceiver = pendingTransfersByAddressReceiver.length;
        uint256 expectedTransferId = pst.s_transferCounter();

        // Act
        vm.prank(SENDER);

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        uint256[] memory updatedPendingTransfersByAddressSender = pst.getPendingTransfersForAddress(SENDER);
        uint256 newLengthSender = updatedPendingTransfersByAddressSender.length;
        uint256[] memory updatedPendingTransfersByAddressReceiver = pst.getPendingTransfersForAddress(RECEIVER);
        uint256 newLengthReceiver = updatedPendingTransfersByAddressReceiver.length;

        // Assert
        assertEq(
            newLengthSender, initialLengthSender + 1, "Pending transfer for address array length should increse by one"
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

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

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

        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        uint256 lastInteractionTime = pst.s_lastInteractionTime(SENDER);

        // Assert
        assertEq(lastInteractionTime, block.timestamp, "Last interaction time should be the same as block.timestamp");
    }

    function testTransferCounterIncrementsCorrectly() public {
        // Arrange
        uint256 transferCounter = pst.s_transferCounter();

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
        transferCounter = pst.s_transferCounter();

        // Assert
        assertEq(transferCounter, 1);
    }

    function testTotalTransferCostIsCorrect() public view {
        // Arrange
        uint256 expectedTotalTransferCost = totalTransferCost;

        // Act
        TransferFeeLibrary.TransferFee memory transferFees = pst.getFee();
        uint256 transferFee =
            TransferFeeLibrary.selectTransferFee(AMOUNT_TO_SEND, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, transferFees);
        uint256 _transferFeeCost = (AMOUNT_TO_SEND * transferFee) / FEE_SCALING_FACTOR;
        uint256 _totalTransferCost = AMOUNT_TO_SEND + _transferFeeCost;

        // Assert
        assertEq(_totalTransferCost, expectedTotalTransferCost, "Total transfer cost is not calculated correctly");
    }

    function testTransferFeeCostIsCorrect() public view {
        // Arrange
        uint256 expectedTransferFeeCost = transferFeeCost;

        // Act
        TransferFeeLibrary.TransferFee memory transferFees = pst.getFee();
        uint256 transferFee =
            TransferFeeLibrary.selectTransferFee(AMOUNT_TO_SEND, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, transferFees);
        uint256 _transferFeeCost = (AMOUNT_TO_SEND * transferFee) / FEE_SCALING_FACTOR;

        // Assert
        assertEq(_transferFeeCost, expectedTransferFeeCost, "Transfer fee cost is not calculated correctly");
    }

    function testPasswordEncodingWithSalt() public view {
        // Arrange
        (bytes32 expectedEncodedPaswsword, bytes32 salt) = pst.encodePassword(PASSWORD);

        // Act
        bytes32 encodedPassword = keccak256(abi.encodePacked(PASSWORD, salt));

        // Assert
        assertEq(encodedPassword, expectedEncodedPaswsword, "Password encoding not correct");
    }

    function testPasswordEncodingForDiffSalts() public {
        // Arrange / Act
        (bytes32 encodedPassword1, bytes32 salt1) = pst.encodePassword(PASSWORD);
        vm.warp(block.timestamp + 1);
        vm.roll(block.number + 1);
        (bytes32 encodedPassword2, bytes32 salt2) = pst.encodePassword(PASSWORD);

        // Assert
        assertFalse(salt1 == salt2, "Salts should be different for different calls");
        assertFalse(
            encodedPassword1 == encodedPassword2, "Encoded passwords should be different due to different salts"
        );
    }

    function testCreateTransferRevertsForEthIfInsufficientFunds() public {
        // Arange
        address TEST_SENDER = makeAddr("test sender");
        uint256 SENDER_INSUFFICIENT_AMOUNT = 0.5 ether;
        vm.deal(TEST_SENDER, SENDER_INSUFFICIENT_AMOUNT);

        // Act / Assert
        vm.expectRevert(
            abi.encodeWithSelector(PST.PST__NotEnoughFunds.selector, totalTransferCost, SENDER_INSUFFICIENT_AMOUNT)
        );
        vm.prank(TEST_SENDER);
        pst.createTransfer{value: SENDER_INSUFFICIENT_AMOUNT}(RECEIVER, address(0), AMOUNT_TO_SEND, PASSWORD);
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

    function testCreateTransferRefundsSenderForEthIfMsgValueExceedsTransferCost() public {
        // Arange
        address TEST_SENDER = makeAddr("test sender");
        uint256 SENDER_EXCEEDING_AMOUNT = 1.5 ether;
        vm.deal(TEST_SENDER, SENDER_EXCEEDING_AMOUNT);
        uint256 balanceSenderBefore = TEST_SENDER.balance;
        uint256 expectedBalanceSenderAfter = balanceSenderBefore - totalTransferCost;

        // Act
        vm.prank(TEST_SENDER);
        pst.createTransfer{value: SENDER_EXCEEDING_AMOUNT}(RECEIVER, address(0), AMOUNT_TO_SEND, PASSWORD);
        uint256 balanceSenderAfter = TEST_SENDER.balance;

        // Assert
        assertEq(balanceSenderAfter, expectedBalanceSenderAfter, "Refund not working");
    }

    function testCreateTransferSendsEthToPSTContract() public {
        // Arange
        uint256 beforeBalance = pst.getBalance();
        uint256 expectedAfterBalance = beforeBalance + totalTransferCost;

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(0), AMOUNT_TO_SEND, PASSWORD);
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
        address TEST_SENDER = makeAddr("test sender");
        uint256 SENDER_INSUFFICIENT_AMOUNT = 0.5 ether;
        vm.deal(TEST_SENDER, 100 ether);
        mockERC20Token.transfer(TEST_SENDER, SENDER_INSUFFICIENT_AMOUNT);
        vm.deal(TEST_SENDER, 100 ether);

        // Act / Assert
        vm.expectRevert(
            abi.encodeWithSelector(PST.PST__NotEnoughFunds.selector, totalTransferCost, SENDER_INSUFFICIENT_AMOUNT)
        );
        vm.prank(TEST_SENDER);
        pst.createTransfer{value: SENDER_INSUFFICIENT_AMOUNT}(
            RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD
        );
    }

    function testCreateTransferRevertsIfErc20TransferFails() public {
        // Arange
        FailingERC20Mock failingERC20Mock = new FailingERC20Mock("FailingERC20MockToken", "FAILERC20MOCK", 1e6 ether);
        failingERC20Mock.transfer(SENDER, 100 ether);
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(failingERC20Mock));

        // Act / Assert
        vm.expectRevert(PST.PST__TransferFailed.selector);
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(failingERC20Mock), AMOUNT_TO_SEND, PASSWORD);
    }

    function testCreateTransferSendsERC20TokenToPSTContract() public {
        // Arange
        uint256 beforeBalance = mockERC20Token.balanceOf(address(pst));
        uint256 expectedAfterBalance = beforeBalance + totalTransferCost;

        // Act
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
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
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        transferId = pst.s_transferCounter() - 1;

        vm.prank(SENDER);
        pst.claimTransfer(transferId, PASSWORD);

        // Act / Assert
        vm.prank(SENDER);
        vm.expectRevert(PST.PST__TransferNotPending.selector);
        pst.cancelTransfer(transferId);
    }

    /*//////////////////////////////////////////////////////////////
                        CLAIM TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
                        FEE WITHDRAWAL TESTS
    //////////////////////////////////////////////////////////////*/
    function testFeeWithdrawal() public {
        // Arrange

        // Act

        // Assert
    }
}

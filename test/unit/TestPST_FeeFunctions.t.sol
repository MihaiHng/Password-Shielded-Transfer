// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";
import {FailingERC20Mock_ForCancelAndClaimTransferTest} from
    "../mocks/FailingERC20Mock_ForCancelAndClaimTransferTest.sol";
import {NonPayableContractMock} from "../mocks/NonPayableContractMock.sol";

contract TestPST_FeeFunctions is Test {
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

    address public SENDER = makeAddr("sender");
    address public RECEIVER = makeAddr("receiver");
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;

    event LastInteractionTimeUpdated(address indexed user, uint256 indexed lastInteractionTime);
    event TokenAddedToAllowList(address indexed token);
    event TokenRemovedFromAllowList(address indexed token);

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();
        mockERC20Token = new ERC20Mock("ERC20MockToken", "ERC20MOCK", 1e6 ether);

        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(mockERC20Token));

        vm.deal(SENDER, SENDER_BALANCE);
        mockERC20Token.transfer(SENDER, 100 ether);

        (totalTransferCost, transferFeeCost) = TransferFeeLibrary.calculateTotalTransferCost(
            AMOUNT_TO_SEND, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, pst.getTransferFees()
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
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
        _;
    }

    modifier transferCreatedAndCanceled() {
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        transferId = pst.s_transferCounter() - 1;
        vm.prank(SENDER);
        pst.cancelTransfer(transferId);
        _;
    }

    modifier transferCreatedAndClaimed() {
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        vm.prank(RECEIVER);
        pst.claimTransfer(transferId, PASSWORD);
        _;
    }

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
        (uint256 lvlOne, uint256 lvlTwo, uint256 lvlThree) = pst.transferFee();

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

        (uint256 lvlOne, uint256 lvlTwo, uint256 lvlThree) = pst.transferFee();

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
                        FEE WITHDRAWAL TESTS
    //////////////////////////////////////////////////////////////*/
    function testFeeWithdrawalForToken_ETH() public {
        // Arrange
        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(0), AMOUNT_TO_SEND, PASSWORD);

        uint256 withdrawalAmount = pst.s_feeBalances(address(0));
        uint256 initialOwnerBalance = pst.owner().balance;
        console.log(withdrawalAmount);

        // Act
        vm.prank(pst.owner());
        pst.withdrawFeesForToken(address(0), withdrawalAmount);
        uint256 newOwnerBalance = pst.owner().balance;

        // Assert
        assertEq(
            newOwnerBalance,
            initialOwnerBalance + withdrawalAmount,
            "Owner balance should increase with withdrawal amount"
        );
    }

    function testFeeWithdrawalForToken_ETH_RevertsIfTransferFails() public {
        // Arrange
        NonPayableContractMock nonPayableERC20Mock = new NonPayableContractMock();
        vm.prank(pst.owner());
        pst.transferOwnership(address(nonPayableERC20Mock));

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(0), AMOUNT_TO_SEND, PASSWORD);
        uint256 withdrawalAmount = pst.s_feeBalances(address(0));

        // Act / Assert
        vm.prank(address(nonPayableERC20Mock));
        vm.expectRevert(PST.PST__FeeWIthdrawalFailed.selector);
        pst.withdrawFeesForToken(address(0), withdrawalAmount);
    }

    function testFeeWithdrawalForToken_ERC20() public transferCreated {
        // Arrange
        uint256 withdrawalAmount = pst.s_feeBalances(address(mockERC20Token));
        uint256 initialOwnerBalance = mockERC20Token.balanceOf(address(pst.owner()));
        console.log(withdrawalAmount);

        // Act
        vm.prank(pst.owner());
        pst.withdrawFeesForToken(address(mockERC20Token), withdrawalAmount);
        uint256 newOwnerBalance = mockERC20Token.balanceOf(address(pst.owner()));

        // Assert
        assertEq(
            newOwnerBalance,
            initialOwnerBalance + withdrawalAmount,
            "Owner balance should increase with withdrawal amount"
        );
    }

    function testFeeWithdrawalForToken_ERC20_NotFullFeeAmount() public transferCreated {
        // Arrange
        uint256 feeBalanceBefore = pst.s_feeBalances(address(mockERC20Token));
        uint256 withdrawalAmount = feeBalanceBefore / 2;
        uint256 initialOwnerBalance = mockERC20Token.balanceOf(address(pst.owner()));
        console.log(withdrawalAmount);
        console.log(initialOwnerBalance);

        // Act
        vm.prank(pst.owner());
        pst.withdrawFeesForToken(address(mockERC20Token), withdrawalAmount);
        uint256 newOwnerBalance = mockERC20Token.balanceOf(address(pst.owner()));
        uint256 feeBalanceAfter = pst.s_feeBalances(address(mockERC20Token));

        // Assert
        assertEq(
            newOwnerBalance,
            initialOwnerBalance + withdrawalAmount,
            "Owner balance should increase with withdrawal amount"
        );
        assertEq(
            feeBalanceAfter,
            feeBalanceBefore - withdrawalAmount,
            "Fee balance for token should decrease with withdrawal amount"
        );
    }

    function testFeeWithdrawalForToken_ERC20_RevertsIfTransferFails() public {
        // Arrange
        vm.prank(SENDER);
        FailingERC20Mock_ForCancelAndClaimTransferTest failingERC20Mock =
            new FailingERC20Mock_ForCancelAndClaimTransferTest("FailingERC20MockToken", "FAILERC20MOCK", 1e6 ether);

        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(failingERC20Mock));

        vm.startPrank(SENDER);
        failingERC20Mock.approve(address(pst), 100 ether);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(failingERC20Mock), AMOUNT_TO_SEND, PASSWORD);
        vm.stopPrank();
        uint256 withdrawalAmount = pst.s_feeBalances(address(failingERC20Mock));

        // Act / Assert
        vm.prank(pst.owner());
        vm.expectRevert(PST.PST__FeeWIthdrawalFailed.selector);
        pst.withdrawFeesForToken(address(failingERC20Mock), withdrawalAmount);
    }

    function testWithdrawFeesForToken_FailsIfInsufficientBalance() public transferCreated {
        // Arrange
        uint256 feeBalance = pst.s_feeBalances(address(mockERC20Token));
        uint256 withdrawalAmount = feeBalance + 1;

        // Act & Assert
        vm.prank(pst.owner());
        vm.expectRevert(PST.PST__InsufficientFeeBalance.selector);
        pst.withdrawFeesForToken(address(mockERC20Token), withdrawalAmount);
    }

    function testWithdrawFeesForToken_FailsIfZeroAmout() public transferCreated {
        // Arrange / Act / Assert
        vm.prank(pst.owner());
        vm.expectRevert(PST.PST__NeedsMoreThanZero.selector);
        pst.withdrawFeesForToken(address(mockERC20Token), 0);
    }
}

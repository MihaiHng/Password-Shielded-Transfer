// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {MockERC20} from "../mocks/ERC20Mock.sol";

contract TestPST is Test {
    PST public pst;
    MockERC20 public mockERC20Token;

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
    uint256 private constant AMOUNT_TO_SEND_WITH_FEE = 1.0001 ether;
    string PASSWORD = "Strongpass";

    address public SENDER = makeAddr("sender");
    address public RECEIVER = makeAddr("receiver");
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();
        mockERC20Token = new MockERC20("ERC20MockToken", "ERC20MOCK", 1e6 ether);

        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(mockERC20Token));

        vm.deal(SENDER, SENDER_BALANCE);
        mockERC20Token.transfer(SENDER, 100 ether);
    }

    /*//////////////////////////////////////////////////////////////
                        TRANSFER FEE TESTS
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

    function testFeesAccumulateCorrectly() public {}

    function testFeeWithdrawal() public {}

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
    function testCreateTransferRevertsWhenTokenNotAllowed() public {}

    function testCreateTransferRevertsWhenInsufficientFunds() public {
        // Arange
        address TEST_SENDER = makeAddr("test sender");
        uint256 SENDER_INSUFFICIENT_AMOUNT = 0.5 ether;
        vm.deal(TEST_SENDER, SENDER_INSUFFICIENT_AMOUNT);

        vm.startPrank(TEST_SENDER);
        mockERC20Token.approve(address(pst), AMOUNT_TO_SEND_WITH_FEE);

        // Act / Assert
        vm.expectRevert(
            abi.encodeWithSelector(
                PST.PST__NotEnoughFunds.selector, AMOUNT_TO_SEND_WITH_FEE, SENDER_INSUFFICIENT_AMOUNT
            )
        );
        pst.createTransfer{value: SENDER_INSUFFICIENT_AMOUNT}(
            RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD
        );
        vm.stopPrank();
    }
}

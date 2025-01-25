// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";

contract TestPST is Test {
    PST public pst;

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

    address public USER = makeAddr("user");
    uint256 public constant USER_BALANCE = 100 ether;

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();
    }

    function testInitialTransferFee() public view {
        // Arrange // Act
        uint256 transferFeeLvlOne = pst.getTransferFee(LVL1);
        uint256 transferFeeLvlTWo = pst.getTransferFee(LVL2);
        uint256 transferFeeLvlThree = pst.getTransferFee(LVL3);

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
        uint256 expectedNewTransferFeeLvlOne = 10000;

        // Act
        vm.prank(pst.owner());
        pst.setTransferFee(LVL1, expectedNewTransferFeeLvlOne);
        uint256 newTransferFeeLvlOne = pst.getTransferFee(LVL1);

        // Assert
        assertEq(newTransferFeeLvlOne, expectedNewTransferFeeLvlOne, "Setting new transfer fee not correct");
    }

    function testSetNewTransferFeeLimitOne() public {
        // Arrange
        uint256 expectedNewTransferFeeLimitLvlOne = 15e18;

        // Act
        vm.prank(pst.owner());
        pst.setNewLimitLevelOne(expectedNewTransferFeeLimitLvlOne);
        uint256 newTransferFeeLimitLvlOne = pst.s_limitLevelOne();

        // Assert
        assertEq(
            newTransferFeeLimitLvlOne, expectedNewTransferFeeLimitLvlOne, "Setting new transfer fee limit not correct"
        );
    }

    function testSetNewTransferFeeLimitTwo() public {
        // Arrange
        uint256 expectedNewTransferFeeLimitLvlTwo = 150e18;

        // Act
        vm.prank(pst.owner());
        pst.setNewLimitLevelTwo(expectedNewTransferFeeLimitLvlTwo);
        uint256 newTransferFeeLimitLvlTwo = pst.s_limitLevelTwo();

        // Assert
        assertEq(
            newTransferFeeLimitLvlTwo, expectedNewTransferFeeLimitLvlTwo, "Setting new transfer fee limit not correct"
        );
    }

    function testSetNewScallingFactor() public {}

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
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";
import {FailingERC20Mock_ForCreateTransferTest} from "../mocks/FailingERC20Mock_ForCreateTransferTest.sol";
import {FailingERC20Mock_ForCancelAndClaimTransferTest} from
    "../mocks/FailingERC20Mock_ForCancelAndClaimTransferTest.sol";
import {NonPayableContractMock} from "../mocks/NonPayableContractMock.sol";

contract TestPST is Test {
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
    event TokenAddedToAllowList(address indexed token);
    event TokenRemovedFromAllowList(address indexed token);
    // Event to log a created transfer
    event TransferInitiated(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount,
        uint256 transferFeeCost
    );
    event TransferCanceled(
        address indexed sender, address indexed receiver, uint256 indexed transferIndex, address token, uint256 amount
    );

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
                                EVENT TESTS
    //////////////////////////////////////////////////////////////*/

    function testEmitTransferInitiated() public {
        // Arrange
        uint256 expectedTransferIndex = pst.s_transferCounter();
        // address token = address(mockERC20Token);
        // uint256 amount = AMOUNT_TO_SEND;
        // uint256 transferFeeCost = pst.calculateFee(amount);

        // Act & Assert
        vm.expectEmit(true, true, true, true);
        emit TransferInitiated(
            SENDER, RECEIVER, expectedTransferIndex, address(mockERC20Token), AMOUNT_TO_SEND, transferFeeCost
        );

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(RECEIVER, address(mockERC20Token), AMOUNT_TO_SEND, PASSWORD);
    }

    function testEmitTransferCanceled() public transferCreated {
        // Arrange
        uint256 expectedTransferIndex = pst.s_transferCounter() - 1;

        // Act & Assert
        vm.expectEmit(true, true, true, true);
        emit TransferCanceled(SENDER, RECEIVER, expectedTransferIndex, address(mockERC20Token), AMOUNT_TO_SEND);

        vm.prank(SENDER);
        pst.cancelTransfer(expectedTransferIndex);
    }
}

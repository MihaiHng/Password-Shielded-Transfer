// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../mocks/ERC20Mock.sol";

contract TestPST_Events is Test {
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

    event TransferInitiated(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount,
        uint256 transferFeeCost
    );
    event TransferCanceled(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount
    );
    event TransferCompleted(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount
    );
    event TransferExpiredAndRefunded(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount,
        uint256 expiringTime
    );
    event SuccessfulFeeWithdrawal(
        address indexed token,
        uint256 indexed amount
    );
    event TokenAddedToAllowList(address indexed token);
    event TokenRemovedFromAllowList(address indexed token);
    event TransferFeeChanged(uint8 level, uint256 newTransferFee);

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

        vm.warp(block.timestamp + pst.s_cancelCooldownPeriod() + 1);
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

        // Act & Assert
        vm.expectEmit(true, true, true, true);
        emit TransferInitiated(
            SENDER,
            RECEIVER,
            expectedTransferIndex,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            transferFeeCost
        );

        vm.prank(SENDER);
        pst.createTransfer{value: totalTransferCost}(
            RECEIVER,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            PASSWORD
        );
    }

    function testEmitTransferCanceled() public transferCreated {
        // Arrange
        uint256 expectedTransferIndex = pst.s_transferCounter() - 1;

        // Act & Assert
        vm.expectEmit(true, true, true, true);
        emit TransferCanceled(
            SENDER,
            RECEIVER,
            expectedTransferIndex,
            address(mockERC20Token),
            AMOUNT_TO_SEND
        );

        vm.prank(SENDER);
        pst.cancelTransfer(expectedTransferIndex);
    }

    function testEmitTransferCompleted() public transferCreated {
        // Arrange
        uint256 expectedTransferIndex = pst.s_transferCounter() - 1;
        vm.warp(block.timestamp + pst.s_cancelCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Act & Assert
        vm.expectEmit(true, true, true, true);
        emit TransferCompleted(
            SENDER,
            RECEIVER,
            expectedTransferIndex,
            address(mockERC20Token),
            AMOUNT_TO_SEND
        );

        vm.prank(RECEIVER);
        pst.claimTransfer(expectedTransferIndex, PASSWORD);
    }

    function testEmitTransferExpiredAndRefunded() public transferCreated {
        // Arrange
        uint256 expectedTransferIndex = pst.s_transferCounter() - 1;
        (, , , , , uint256 expiringTime, ) = pst.s_transfersById(
            expectedTransferIndex
        );

        // Act & Assert
        vm.expectEmit(true, true, true, true);
        emit TransferExpiredAndRefunded(
            SENDER,
            RECEIVER,
            expectedTransferIndex,
            address(mockERC20Token),
            AMOUNT_TO_SEND,
            expiringTime
        );

        vm.prank(SENDER);
        pst.refundExpiredTransfer(expectedTransferIndex);
    }

    function testEmitSuccessfulFeeWithdrawal() public transferCreated {
        // Arrange
        uint256 balanceToken = pst.getAccumulatedFeesForToken(
            address(mockERC20Token)
        );

        // Act & Assert
        vm.expectEmit(true, true, false, false);
        emit SuccessfulFeeWithdrawal(address(mockERC20Token), balanceToken);
        vm.prank(pst.owner());
        pst.withdrawFeesForToken(address(mockERC20Token), balanceToken);
    }

    function testEmitTokenAddedToAllowList() public {
        // Arrange
        ERC20Mock anotherMockERC20Token = new ERC20Mock(
            "AnotherERC20MockToken",
            "ERC20MOCKA",
            1e6 ether
        );

        // Act & Assert
        vm.expectEmit(true, false, false, false);
        emit TokenAddedToAllowList(address(anotherMockERC20Token));
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(anotherMockERC20Token));
    }

    function testEmitTokenRemovedFromAllowList() public {
        // Arrange
        ERC20Mock anotherMockERC20Token = new ERC20Mock(
            "AnotherERC20MockToken",
            "ERC20MOCKA",
            1e6 ether
        );
        vm.prank(pst.owner());
        pst.addTokenToAllowList(address(anotherMockERC20Token));

        // Act & Assert
        vm.expectEmit(true, false, false, false);
        emit TokenRemovedFromAllowList(address(anotherMockERC20Token));
        vm.prank(pst.owner());
        pst.removeTokenFromAllowList(address(anotherMockERC20Token));
    }

    function testEmitTransferFeeChanged() public {
        // Arrange
        uint256 newTransferFee = 10;

        // Act & Assert
        vm.expectEmit(false, false, false, false);
        emit TransferFeeChanged(LVL2, newTransferFee);
        vm.prank(pst.owner());
        pst.setTransferFee(LVL2, newTransferFee);
    }
}

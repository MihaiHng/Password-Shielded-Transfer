// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import {PST} from "src/PST.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../../script/DeployPST.s.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";

contract TestFuzzPST is Test {
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
    address RANDOM_USER = makeAddr("Random user");
    uint256 public constant SENDER_BALANCE = 100 ether;
    uint256 public constant RECEIVER_BALANCE = 100 ether;
    uint256 public constant RANDOM_USER_BALANCE = 100 ether;

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

    function testfuzz_ETHTransferRecordsDataCorrectly(
        address _sender,
        address _receiver,
        uint256 _amount,
        string memory _password
    ) public {
        // Arrange
        vm.assume(
            _sender != address(0) &&
                _receiver != address(0) &&
                _sender != _receiver
        );
        vm.assume(_amount > MIN_AMOUNT_TO_SEND && _amount < 100 ether);
        vm.assume(bytes(_password).length >= 7);

        uint256 initialBalance = address(pst).balance;

        (uint256 _totalTransferCost, ) = TransferFeeLibrary
            .calculateTotalTransferCost(
                _amount,
                LIMIT_LEVEL_ONE,
                LIMIT_LEVEL_TWO,
                FEE_SCALING_FACTOR,
                pst.getTransferFees()
            );

        // Act
        vm.deal(_sender, _totalTransferCost);

        vm.prank(_sender);
        pst.createTransfer{value: _totalTransferCost}(
            _receiver,
            address(0),
            _amount,
            _password
        );

        uint256 updatedBalance = address(pst).balance;
        (
            address sender,
            address receiver,
            address token,
            uint256 amount,
            ,
            ,
            bytes32 encodedPassword
        ) = pst.s_transfersById(transferId);

        // Assert
        assertEq(sender, _sender, "Sender should match");
        assertEq(receiver, _receiver, "Receiver should match");
        assertEq(token, address(0), "Token should be ETH");
        assertEq(amount, _amount, "Amount should match");

        assertTrue(pst.s_isPending(transferId), "Transfer should be pending");

        bytes32 expectedPassword = pst.encodePassword(transferId, _password);
        assertEq(
            encodedPassword,
            expectedPassword,
            "Encoded password should match"
        );

        assertEq(
            updatedBalance,
            initialBalance + _totalTransferCost,
            "Contract should hold the transferred ETH"
        );
    }

    function testfuzz_ERC20TransferRecordsDataCorrectly(
        address _sender,
        address _receiver,
        uint256 _amount,
        string memory _password
    ) public {
        // Arrange
        vm.assume(
            _sender != address(0) &&
                _receiver != address(0) &&
                _sender != _receiver
        );
        vm.assume(_amount > MIN_AMOUNT_TO_SEND && _amount < 100 ether);
        vm.assume(bytes(_password).length >= 7);

        uint256 initialBalance = mockERC20Token.balanceOf(address(pst));

        (uint256 _totalTransferCost, ) = TransferFeeLibrary
            .calculateTotalTransferCost(
                _amount,
                LIMIT_LEVEL_ONE,
                LIMIT_LEVEL_TWO,
                FEE_SCALING_FACTOR,
                pst.getTransferFees()
            );

        // Act

        mockERC20Token.transfer(_sender, 101 ether);
        vm.startPrank(_sender);
        mockERC20Token.approve(address(pst), 101 ether);
        pst.createTransfer(
            _receiver,
            address(mockERC20Token),
            _amount,
            _password
        );
        vm.stopPrank();

        uint256 updatedBalance = mockERC20Token.balanceOf(address(pst));
        (
            address sender,
            address receiver,
            address token,
            uint256 amount,
            ,
            ,
            bytes32 encodedPassword
        ) = pst.s_transfersById(transferId);

        // Assert
        assertEq(sender, _sender, "Sender should match");
        assertEq(receiver, _receiver, "Receiver should match");
        assertEq(
            token,
            address(mockERC20Token),
            "Token should be mockERC20Token"
        );
        assertEq(amount, _amount, "Amount should match");

        assertTrue(pst.s_isPending(transferId), "Transfer should be pending");

        bytes32 expectedPassword = pst.encodePassword(transferId, _password);
        assertEq(
            encodedPassword,
            expectedPassword,
            "Encoded password should match"
        );

        assertEq(
            updatedBalance,
            initialBalance + _totalTransferCost,
            "Contract should hold the transferred mockERC20Token"
        );
    }

    function testFuzz_ClaimOnlyWithCorrectPassword(
        address _sender,
        address _receiver,
        uint256 _amount,
        string memory _correctPassword,
        string memory _wrongPassword
    ) public {
        // Arrange
        vm.assume(
            _sender != address(0) &&
                _receiver != address(0) &&
                _sender != _receiver
        );
        vm.assume(_amount > MIN_AMOUNT_TO_SEND && _amount < 100 ether);
        vm.assume(bytes(_correctPassword).length >= 7);
        vm.assume(bytes(_wrongPassword).length >= 4);
        vm.assume(
            keccak256(abi.encodePacked(_correctPassword)) !=
                keccak256(abi.encodePacked(_wrongPassword))
        );

        uint256 initialBalance = mockERC20Token.balanceOf(_receiver);

        // Act
        mockERC20Token.transfer(_sender, 101 ether);
        vm.startPrank(_sender);
        mockERC20Token.approve(address(pst), 101 ether);

        pst.createTransfer(
            _receiver,
            address(mockERC20Token),
            _amount,
            _correctPassword
        );
        vm.stopPrank();

        vm.warp(block.timestamp + pst.s_cancelCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        // Assert
        assertTrue(pst.s_isPending(transferId), "Transfer should be pending");

        vm.prank(_receiver);
        vm.expectRevert();
        pst.claimTransfer(transferId, _wrongPassword);

        assertTrue(
            pst.s_isPending(transferId),
            "Transfer should still be pending after incorrect password attempt"
        );

        vm.prank(_receiver);
        pst.claimTransfer(transferId, _correctPassword);
        uint256 updatedBalance = mockERC20Token.balanceOf(_receiver);

        assertFalse(
            pst.s_isPending(transferId),
            "Transfer should not be pending after correct claim"
        );

        assertEq(
            updatedBalance,
            initialBalance + _amount,
            "Receiver should receive the correct amount"
        );
    }

    function testFuzz_FeesAndBalances(
        address _sender,
        address _receiver,
        uint256 _amount,
        string memory _password
    ) public {
        // Arrange
        vm.assume(
            _sender != address(0) &&
                _receiver != address(0) &&
                _sender != _receiver
        );
        vm.assume(_amount > MIN_AMOUNT_TO_SEND && _amount < 100 ether);
        vm.assume(bytes(_password).length >= 7);

        mockERC20Token.transfer(_receiver, 0);

        (
            uint256 _totalTransferCost,
            uint256 _transferFeeCost
        ) = TransferFeeLibrary.calculateTotalTransferCost(
                _amount,
                LIMIT_LEVEL_ONE,
                LIMIT_LEVEL_TWO,
                FEE_SCALING_FACTOR,
                pst.getTransferFees()
            );

        // Act
        mockERC20Token.transfer(_sender, 101 ether);
        vm.startPrank(_sender);
        mockERC20Token.approve(address(pst), 101 ether);

        uint256 initialBalanceSender = mockERC20Token.balanceOf(_sender);

        pst.createTransfer(
            _receiver,
            address(mockERC20Token),
            _amount,
            _password
        );
        vm.stopPrank();

        uint256 updatedBalanceSender = mockERC20Token.balanceOf(_sender);
        uint256 initialBalanceReceiver = mockERC20Token.balanceOf(_receiver);
        uint256 initialBalancePST = mockERC20Token.balanceOf(address(pst));

        // Assert
        assertEq(
            updatedBalanceSender,
            initialBalanceSender - _totalTransferCost,
            "Sender balance should be deducted correctly"
        );

        assertEq(
            initialBalancePST,
            _amount + _transferFeeCost,
            "Contract should hold the full transfer amount + the transfer fee"
        );

        assertEq(
            initialBalanceReceiver,
            0,
            "Receiver should not have funds before claiming"
        );

        vm.warp(block.timestamp + pst.s_cancelCooldownPeriod() + 1);
        vm.roll(block.number + 1);

        vm.prank(_receiver);
        pst.claimTransfer(transferId, _password);
        uint256 updatedBalanceReceiver = mockERC20Token.balanceOf(_receiver);
        uint256 updatedBalancePST = mockERC20Token.balanceOf(address(pst));

        uint256 tokenBalance = pst.getAccumulatedFeesForToken(
            address(mockERC20Token)
        );

        assertEq(
            updatedBalanceReceiver,
            _amount,
            "Receiver should receive the correct amount"
        );

        assertEq(
            updatedBalancePST,
            _transferFeeCost,
            "Contract should retain the correct fee"
        );

        assertEq(
            tokenBalance,
            _transferFeeCost,
            "Balance of token should update with the correct transfer fee"
        );
    }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DeployPST} from "../../script/DeployPST.s.sol";
import {PST} from "src/PST.sol";

contract TestPST is Test {
    PST public pst;

    // Constants for fee levels (match deployment script values)
    uint256 private constant TRANSFER_FEE_LVL_ONE = 1000; // 0.1% for <= 10 ETH
    uint256 private constant TRANSFER_FEE_LVL_TWO = 100; // 0.01% for > 10 ETH and <= 100 ETH
    uint256 private constant TRANSFER_FEE_LVL_THREE = 10; // 0.001% for > 100 ETH

    address public USER = makeAddr("user");
    uint256 public constant USER_BALANCE = 100 ether;

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();
    }

    function testInitialTransferFee() public view {
        uint8 level1 = 1;
        uint8 level2 = 2;
        uint8 level3 = 3;

        assertEq(pst.getTransferFee(level1), TRANSFER_FEE_LVL_ONE, "Fee level 1 is incorrect");
        assertEq(pst.getTransferFee(level2), TRANSFER_FEE_LVL_TWO, "Fee level 2 is incorrect");
        assertEq(pst.getTransferFee(level3), TRANSFER_FEE_LVL_THREE, "Fee level 3 is incorrect");
    }
}

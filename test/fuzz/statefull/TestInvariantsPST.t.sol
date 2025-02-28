// SPDX-License-Identifier: MIT

// 1. Pst balance is always equal to the sum of the total pending transfers value
// 2. A pending transfer can only be claimed with the correct password
// 3. A pending transfer can only be canceled by its sender/creator
// 4. A pending transfer always expires after the availability period has elapsed
// 5. A receiver can only withdraw the amount sent to him

pragma solidity ^0.8.28;

import {PST} from "src/PST.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../../script/DeployPST.s.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";
import {Handler} from "./Handler.t.sol";

contract TestFuzzPST is Test {
    PST public pst;
    Handler public handler;
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

    function setUp() public {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();

        mockERC20Token = new ERC20Mock("ERC20MockToken", "ERC20MOCK", 1e6 ether);

        handler = new Handler(pst);
        targetContract(address(handler));
    }

    function invariant_TotalPendingTransfersDoesNotExceedBalance() public {}
}

// SPDX-License-Identifier: MIT

// 1. Pst balance is always equal to the sum of the total pending transfers value + fees value
// 2. A pending transfer can only be claimed with the correct password
// 3. A pending transfer can only be canceled by its sender/creator
// 4. A pending transfer always expires after the availability period has elapsed
// 5. A receiver can only withdraw the amount sent to him
// 6. Getter view functions should never revert

pragma solidity ^0.8.28;

import {PST} from "src/PST.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test, console, console2} from "forge-std/Test.sol";
import {DeployPST} from "../../../script/DeployPST.s.sol";
import {TransferFeeLibrary} from "src/libraries/TransferFeeLib.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";
import {Handler} from "./Handler.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../mocks/ERC20Mock.sol";

contract TestInvariantsPST is StdInvariant, Test {
    PST public pst;
    Handler public handler;
    ERC20Mock[] public tokens;

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
    uint256 private constant LIMIT_LEVEL_ONE = 10e18;
    uint256 private constant LIMIT_LEVEL_TWO = 100e18;
    uint256 private constant FEE_SCALING_FACTOR = 10e6;

    function setUp() external {
        DeployPST deployer = new DeployPST();
        pst = deployer.run();

        handler = new Handler(pst);
        targetContract(address(handler));

        // address mockReceiver = address(0x1234);
        // uint256 mockAmount = 1e18;
        // string memory mockPassword = "securepass";

        // console.log("Sender initial balance: ", IERC20(tokens[0]).balanceOf(address(this)));

        // console.log("Handler balance before transfer: ", tokens[0].balanceOf(address(handler)));

        // console.log("Calling createTransfer...");
        // handler.createTransfer(mockReceiver, 1, mockAmount, mockPassword);
    }

    function invariant_TotalPendingTransfersDoesNotExceedBalance() public {
        console.log("Test started");
        //uint256 pstTokenBalance = pst.getBalanceForToken(address(mockERC20Token1));
        //console.log("Balance: ", pstTokenBalance);

        uint256 totalPendingValue;
        uint256[] memory pendingTransfers = pst.getPendingTransfers();

        for (uint256 i = 0; i < pendingTransfers.length; i++) {
            uint256 pendingTransferId = pendingTransfers[i];
            (,,, uint256 amount,,,) = pst.s_transfersById(pendingTransferId);
            (totalTransferCost, transferFeeCost) = TransferFeeLibrary.calculateTotalTransferCost(
                amount, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, pst.getTransferFees()
            );

            totalPendingValue += totalTransferCost;
        }
        console.log("Total pending value: ", totalPendingValue);

        //assert(pstTokenBalance == totalPendingValue);

        // Create new mapping to store the contract pending balance for each token, separately from the fee mapping
        // Create a getter for the pending token balance
        // Check if the contract token balance pending token balance is equal with the pending token balance + token fee balance
    }

    // function invariant_Test() public pure {
    //     uint256 x = 1;
    //     uint256 y = 2;

    //     assert(x < y);
    // }
}

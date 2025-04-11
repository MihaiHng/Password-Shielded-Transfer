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

        ERC20Mock mockERC20Token1 = new ERC20Mock("MockToken1", "MCK1", 1e31 ether);
        ERC20Mock mockERC20Token2 = new ERC20Mock("MockToken2", "MCK2", 1e31 ether);
        ERC20Mock mockERC20Token3 = new ERC20Mock("MockToken3", "MCK3", 1e31 ether);

        tokens = new ERC20Mock[](3);

        tokens[0] = mockERC20Token1;
        tokens[1] = mockERC20Token2;
        tokens[2] = mockERC20Token3;

        handler = new Handler(pst);
        targetContract(address(handler));

        for (uint256 i = 0; i < tokens.length; i++) {
            ERC20Mock(tokens[i]).transfer(address(handler), 1e30 ether);

            vm.prank(pst.owner());
            pst.addTokenToAllowList(address(tokens[i]));
        }

        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = bytes4(keccak256("createTransfer(address,uint256,string,uint256)"));
        selectors[1] = bytes4(keccak256("cancelTransfer(uint256)"));
        selectors[2] = bytes4(keccak256("claimTransfer(uint256,bool,string)"));

        // bytes4[] memory selectors2 = new bytes4[](2);
        // selectors2[0] = bytes4(keccak256("cancelTransfer(uint256)"));
        // selectors2[1] = bytes4(keccak256("claimTransfer(uint256,string)"));

        FuzzSelector memory selector = FuzzSelector({addr: address(handler), selectors: selectors});

        targetSelector(selector);

        // bytes4[] memory selectorsNo = new bytes4[](3);
        // selectorsNo[0] = bytes4(keccak256("setTokens(address[])"));
        // excludeSelector(FuzzSelector({addr: address(handler), selectors: selectorsNo}));

        handler.setTokens(tokens);

        console.log("Setup completed");

        // address mockReceiver = address(0x1234);
        // uint256 mockAmount = 1e18;
        // string memory mockPassword = "securepass";

        // console.log("Sender initial balance: ", IERC20(tokens[0]).balanceOf(address(this)));

        // console.log("Handler balance before transfer: ", tokens[0].balanceOf(address(handler)));

        // console.log("Calling createTransfer...");
        // handler.createTransfer(mockReceiver, 1, mockAmount, mockPassword);
    }

    function invariant_TotalPendingTransfersDoesNotExceedBalances() public {
        address tokenAddress = handler.lastUsedToken();
        ERC20Mock selectedToken = ERC20Mock(tokenAddress);

        uint256 totalPendingValue;
        uint256[] memory pendingTransfers = pst.getPendingTransfers();

        for (uint256 i = 0; i < pendingTransfers.length; i++) {
            uint256 pendingTransferId = pendingTransfers[i];
            (,, address token, uint256 amount,,,) = pst.s_transfersById(pendingTransferId);

            // Skip if not matching selected token
            if (token != address(selectedToken)) continue;

            (totalTransferCost, transferFeeCost) = TransferFeeLibrary.calculateTotalTransferCost(
                amount, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, pst.getTransferFees()
            );

            totalPendingValue += totalTransferCost;
        }

        uint256 pstTokenBalance = selectedToken.balanceOf(address(pst));

        console.log("Total pending value for token:", totalPendingValue);
        console.log("Actual PST token balance:     ", pstTokenBalance);

        assertEq(pstTokenBalance, totalPendingValue, "PST token balance should match total pending value");
    }

    function invariant_gettersCantRevert() public view {
        pst.getTransferFees();
        pst.getTrackedAddresses();
        pst.getAllowedTokens();
        pst.getBalance();
    }

    // function invariant_TotalPendingTransfersDoesNotExceedBalance() public {
    //     console.log("Test started");
    //     //uint256 pstTokenBalance = pst.getBalanceForToken(address(mockERC20Token1));
    //     //console.log("Balance: ", pstTokenBalance);

    //     uint256 totalPendingValue;
    //     uint256[] memory pendingTransfers = pst.getPendingTransfers();

    //     for (uint256 i = 0; i < pendingTransfers.length; i++) {
    //         uint256 pendingTransferId = pendingTransfers[i];
    //         (,,, uint256 amount,,,) = pst.s_transfersById(pendingTransferId);
    //         (totalTransferCost, transferFeeCost) = TransferFeeLibrary.calculateTotalTransferCost(
    //             amount, LIMIT_LEVEL_ONE, LIMIT_LEVEL_TWO, FEE_SCALING_FACTOR, pst.getTransferFees()
    //         );

    //         totalPendingValue += totalTransferCost;
    //     }
    //     console.log("Total pending value: ", totalPendingValue);

    //     //assert(pstTokenBalance == totalPendingValue);

    //     // Create new mapping to store the contract pending balance for each token, separately from the fee mapping
    //     // Create a getter for the pending token balance
    //     // Check if the contract token balance pending token balance is equal with the pending token balance + token fee balance
    // }

    // function invariant_Test() public pure {
    //     uint256 x = 1;
    //     uint256 y = 2;

    //     assert(x < y);
    // }
}

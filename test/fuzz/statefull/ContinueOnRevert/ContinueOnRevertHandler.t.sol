// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Test, console, console2} from "forge-std/Test.sol";
import {PST} from "src/PST.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "../../../mocks/ERC20Mock.sol";

contract ContinueOnRevertHandler is Test {
    PST public pst;

    address public lastUsedToken;

    ERC20Mock[] public tokens;
    uint256[] public pendingTransfers;
    address[] public trackedUsers;
    uint256[] public trackedTransferIds;

    mapping(uint256 => string) public passwords;

    uint256 MAX_AMOUNT_TO_SEND = type(uint96).max;
    uint256 MIN_AMOUNT_TO_SEND = 1e14;

    // address[] public actors;
    // address internal currentActor;

    constructor(PST _pst) {
        pst = _pst;
    }

    // modifier useActor(uint256 actorIndexSeed) {
    //     currentActor = actors[bound(actorIndexSeed, 0, actors.length - 1)];
    //     vm.startPrank(currentActor);
    //     _;
    //     vm.stopPrank();
    // }

    function createTransfer(
        address receiver,
        uint256 amount,
        string memory passwordData,
        uint256 tokenIndexedSeed
    ) public {
        console.log("Handler: createTransfer called");

        vm.assume(receiver != address(0) && receiver != address(this));

        //vm.assume(bytes(password).length >= 7);
        string memory password;
        if (bytes(passwordData).length < 7) {
            password = "default_password"; // Use a default valid password
        } else {
            password = string(passwordData); // Use the provided password
        }

        amount = bound(amount, MIN_AMOUNT_TO_SEND, MAX_AMOUNT_TO_SEND);
        tokenIndexedSeed = bound(tokenIndexedSeed, 0, tokens.length - 1);
        console.log("Tokens length:", tokens.length);

        ERC20Mock selectedToken = getToken(tokenIndexedSeed);
        console.log("Selected token:", address(selectedToken));

        selectedToken.approve(address(pst), 1e30 ether);

        lastUsedToken = address(selectedToken);

        pst.createTransfer(receiver, address(selectedToken), amount, password);

        uint256 transferId = pst.s_transferCounter() - 1; // Get latest ID
        pendingTransfers.push(transferId);
        trackedUsers.push(receiver);
        trackedTransferIds.push(transferId);
        console.log("Transfer Id:", transferId);

        passwords[transferId] = password;
        console.log("Password:", passwords[transferId]);
    }

    function cancelTransfer(uint256 index) public {
        console.log("Handler: cancelTransfer called");

        if (pendingTransfers.length == 0) return;

        index = bound(index, 0, pendingTransfers.length - 1);
        uint256 transferId = pendingTransfers[index];

        (address sender, , , , , , ) = pst.s_transfersById(transferId);
        if (sender != address(this) || !pst.s_isPending(transferId)) {
            // Instead of discarding, check for a valid transfer id
            for (uint256 i = 0; i < pendingTransfers.length; i++) {
                transferId = pendingTransfers[i];
                (sender, , , , , , ) = pst.s_transfersById(transferId);
                if (sender == address(this) && pst.s_isPending(transferId)) {
                    index = i;
                    break;
                }
            }
            // If still no valid transfer id was found, return without discarding the test
            if (sender != address(this) || !pst.s_isPending(transferId)) return;
        }

        pst.cancelTransfer(transferId);

        removeFromPendingTransfers(transferId);
    }

    function claimTransfer(
        uint256 index /*, bool useValidPassword, string memory invalidPassword*/
    ) public {
        console.log("Handler: claimTransfer called");

        if (pendingTransfers.length == 0) return;

        vm.warp(block.timestamp + pst.s_claimCooldownPeriod() + 1);

        index = bound(index, 0, pendingTransfers.length - 1);
        uint256 transferId = pendingTransfers[index];

        //vm.assume(pst.s_isPending(transferId)); This was causing lots of discards (50%)
        if (!pst.s_isPending(transferId)) {
            // Instead of discarding, check for a valid transfer id
            for (uint256 i = 0; i < pendingTransfers.length; i++) {
                transferId = pendingTransfers[i];
                if (pst.s_isPending(transferId)) {
                    index = i;
                    break;
                }
            }
            // If still no valid transfer id was found, return without discarding the test
            if (!pst.s_isPending(transferId)) return;
        }

        (, address receiver, , , , , ) = pst.s_transfersById(transferId);

        //string memory password = useValidPassword ? passwords[transferId] : invalidPassword;
        string memory password = passwords[transferId];
        console.log("Password: ", password);

        vm.startPrank(receiver);
        pst.claimTransfer(transferId, password);
        vm.stopPrank();

        removeFromPendingTransfers(transferId);
    }

    function refundExpiredTransfers() public {
        console.log("Handler: refundExpiredTransfers called");

        // Warp time forward — enough to ensure some transfers may be expired
        vm.warp(block.timestamp + pst.s_availabilityPeriod() + 1);

        uint256 numTransfers = pendingTransfers.length;

        for (uint256 i = 0; i < numTransfers; i++) {
            uint256 transferId = pendingTransfers[i];
            (, , , , , uint256 expiringTime, ) = pst.s_transfersById(
                transferId
            );

            if (block.timestamp > expiringTime && pst.s_isPending(transferId)) {
                try pst.refundExpiredTransfer(transferId) {
                    console.log("Refunded transfer: ", transferId);
                } catch {
                    console.log("Refund failed for transfer: ", transferId);
                }
            }
        }
    }

    function removeFromPendingTransfers(uint256 transferId) internal {
        for (uint256 i = 0; i < pendingTransfers.length; i++) {
            if (pendingTransfers[i] == transferId) {
                pendingTransfers[i] = pendingTransfers[
                    pendingTransfers.length - 1
                ];
                pendingTransfers.pop();
                break;
            }
        }
    }

    function getToken(uint256 index) internal view returns (ERC20Mock) {
        return ERC20Mock(tokens[index % tokens.length]); // Ensure valid index selection
    }

    function setTokens(ERC20Mock[] memory _tokens) external {
        tokens = _tokens;
    }

    function getTrackedUsersLength() public view returns (uint256) {
        return trackedUsers.length;
    }

    function getTrackedUserAt(uint256 i) public view returns (address) {
        return trackedUsers[i];
    }

    function getTrackedTransferIdsLength() public view returns (uint256) {
        return trackedTransferIds.length;
    }

    function getTrackedTransferIdAt(uint256 i) public view returns (uint256) {
        return trackedTransferIds[i];
    }

    function getPendingTransfersLength() public view returns (uint256) {
        return pendingTransfers.length;
    }

    function getPendingTransfersAt(uint256 i) public view returns (uint256) {
        return pendingTransfers[i];
    }
}

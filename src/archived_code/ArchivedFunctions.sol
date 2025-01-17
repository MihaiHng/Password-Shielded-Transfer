/**
 * @dev This is the function that the Chainlink Automation nodes call
 * they look for `upkeepNeeded` to return True.
 * the following should be true for this to return true:
 * 1.
 * 2.
 * 3.
 * 4. Implicity, your subscription is funded with LINK.
 */
// function checkUpkeep(bytes calldata /* checkData */ )
//     external
//     view
//     override
//     returns (bool upkeepNeeded, bytes memory performData)
// {
//     uint256 batchLimit = s_batchLimit;
//     uint256[] memory expiredTransfers = getExpiredTransfers();
//     uint256 expiredCount = expiredTransfers.length;

//     address[] memory trackedAddresses = s_addressList;
//     address[] memory addressesReadyForCleanup = new address[](batchLimit);
//     address[] memory addressesReadyToBeRemoved = new address[](batchLimit);
//     uint256 countAddressesReadyForCleanup;
//     uint256 countAddressesToBeRemoved;

//     if (trackedAddresses.length == 0 && expiredCount == 0) {
//         upkeepNeeded = false;
//         performData = "";
//         return (upkeepNeeded, performData);
//     }

//     for (
//         uint256 i = 0;
//         i < trackedAddresses.length && (countAddressesReadyForCleanup + countAddressesToBeRemoved) < batchLimit;
//         i++
//     ) {
//         address user = trackedAddresses[i];

//         if ((block.timestamp - s_lastCleanupTimeByAddress[user]) >= s_cleanupInterval) {
//             addressesReadyForCleanup[countAddressesReadyForCleanup] = user;
//             countAddressesReadyForCleanup++;
//         }

//         if ((block.timestamp - s_lastInteractionTime[user]) >= s_inactivityThreshhold) {
//             addressesReadyToBeRemoved[countAddressesToBeRemoved] = user;
//             countAddressesToBeRemoved++;
//         }
//     }

//     if (expiredCount > 0 || countAddressesReadyForCleanup > 0 || countAddressesToBeRemoved > 0) {
//         upkeepNeeded = true;

//         uint256[] memory batchExpiredTransfers = new uint256[](batchLimit);
//         uint256 batchExpiredCount = expiredCount > batchLimit ? batchLimit : expiredCount;

//         if (expiredCount > 0) {
//             for (uint256 i = 0; i < batchExpiredCount; i++) {
//                 batchExpiredTransfers[i] = expiredTransfers[i];
//             }

//             performData = abi.encode(
//                 batchExpiredTransfers,
//                 batchExpiredCount,
//                 addressesReadyForCleanup,
//                 countAddressesReadyForCleanup,
//                 addressesReadyToBeRemoved,
//                 countAddressesToBeRemoved
//             );
//         }
//     } else {
//         upkeepNeeded = false;
//         performData = "";
//     }
// }

// function performUpkeep(bytes calldata performData) external override {
//     (
//         uint256[] memory batchExpiredTransfers,
//         uint256 batchExpiredCount,
//         address[] memory addressesReadyForCleanup,
//         uint256 countAddressesToBeCleaned,
//         address[] memory addressesReadyToBeRemoved,
//         uint256 countAddressesToBeRemoved
//     ) = abi.decode(performData, (uint256[], uint256, address[], uint256, address[], uint256));

//     for (uint256 i = 0; i < batchExpiredCount; i++) {
//         refundExpiredTransfer(batchExpiredTransfers[i]);
//     }

//     for (uint256 i = 0; i < countAddressesToBeCleaned; i++) {
//         address user = addressesReadyForCleanup[i];

//         removeAllCanceledTransfersByAddress(user);
//         removeAllExpiredAndRefundedTransfersByAddress(user);
//         removeAllClaimedTransfersByAddress(user);

//         s_lastCleanupTimeByAddress[user] = block.timestamp;
//     }

//     for (uint256 i = 0; i < countAddressesToBeRemoved; i++) {
//         address user = addressesReadyToBeRemoved[i];
//         removeAddressFromTracking(user);
//     }
// }

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

/**
 * @title TransferFeeLibrary
 * @author Mihai Hanga
 * @notice This library contains the transfer fee logic
 */
library TransferFeeLibrary {
    struct TransferFee {
        uint256 lvlOne;
        uint256 lvlTwo;
        uint256 lvlThree;
    }

    function selectTransferFee(
        uint256 _amount,
        uint256 s_limitLevelOne,
        uint256 s_limitLevelTwo,
        TransferFee memory transferFees
    ) internal pure returns (uint256 transferFee) {
        if (_amount <= s_limitLevelOne) {
            transferFee = transferFees.lvlOne;
        } else if (_amount <= s_limitLevelTwo) {
            transferFee = transferFees.lvlTwo;
        } else {
            transferFee = transferFees.lvlThree;
        }

        return transferFee;
    }

    function calculateTotalTransferCost(
        uint256 amount,
        uint256 s_limitLevelOne,
        uint256 s_limitLevelTwo,
        uint256 s_feeScalingFactor,
        TransferFee memory transferFees
    ) internal pure returns (uint256 totalTransferCost, uint256 transferFeeCost) {
        uint256 _transferFee = selectTransferFee(amount, s_limitLevelOne, s_limitLevelTwo, transferFees);
        uint256 _transferFeeCost = (amount * _transferFee) / s_feeScalingFactor;
        uint256 _totalTransferCost = amount + _transferFeeCost;

        return (_totalTransferCost, _transferFeeCost);
    }
}

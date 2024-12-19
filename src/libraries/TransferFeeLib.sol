// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

/**
 * @title TransferFeeLibrary
 * @author Mihai Hanga
 * @notice This library contains the transfer fee logic
 */
library TransferFeeLibrary {
    struct TransferFeeLevels {
        uint256 lvlOne;
        uint256 lvlTwo;
        uint256 lvlThree;
    }

    uint256 private constant LIMITLEVELONE = 10e18;
    uint256 private constant LIMITLEVELTWO = 100e18;

    function selectTransferFee(uint256 _amount, TransferFeeLevels memory transferFees)
        internal
        pure
        returns (uint256 transferFee)
    {
        if (_amount <= LIMITLEVELONE) {
            transferFee = transferFees.lvlOne;
        } else if (_amount <= LIMITLEVELTWO) {
            transferFee = transferFees.lvlTwo;
        } else {
            transferFee = transferFees.lvlThree;
        }

        return transferFee;
    }

    function calculateTotalTransferCost(uint256 amount, TransferFeeLevels memory transferFees)
        internal
        pure
        returns (uint256 totalTransferCost, uint256 transferFeeCost)
    {
        uint256 _transferFee = selectTransferFee(amount, transferFees);
        uint256 _transferFeeCost = amount * _transferFee;
        uint256 _totalTransferCost = amount + _transferFeeCost;

        return (_totalTransferCost, _transferFeeCost);
    }
}

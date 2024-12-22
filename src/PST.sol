// SPDX-License-Identifier: MIT

// Layout of Contract:
// version
// imports
// interfaces, libraries, contracts
// errors
// Type declarations
// State variables
// Events
// Modifiers
// Functions

// Layout of Functions:
// constructor
// receive function (if exists)
// fallback function (if exists)
// external
// public
// internal
// private
// view & pure functions

pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TransferFeeLibrary} from "./libraries/TransferFeeLib.sol";

/**
 * @title PST Password Shielded Transfer
 * @author Mihai Hanga
 *
 * @dev This smart contract is the core of the Password Shielded Transfer(PST)
 * The main functionality of this system is the use of passwords to increase the security of transfers between two parties
 *
 * A Password Shielded Transfer will require the following steps:
 *  - [Person A] creates a transfer with the following transfer details:
 *      - address of [Person B]
 *      - [amount] transfered
 *      - [password]
 *  - [Person A] sends the [secure password] to Person B, preferably via a secure communication method
 *  - At this point there is a transfer created in the system, waiting to be unlocked and claimed with the [password] provided by [Person A]
 *  - [Person A] has the possibility to [cancel] the transfer if they change their mind, as long as [Berson B] didn't claim it
 *  - [Person B] accesses the pending transfer and enters the [secure password] received from [Person A]
 *  - If the password entered by [Person B] matches the password which was set up by [Person A] the transfer will be unlocked for [Person B]
 *  - At this point [Person B] can claim [amount] sent by [Person A]
 *
 * Additional properties of the system:
 *
 * @notice The added layer of security provided by the [secure password] allows [Person A] to cancel the tranfer and claim back the [amount]
 * at any point before the receiver [Person B] claims the [amount]
 * @notice The platform will charge a fee per transfer. The fee is calculated as a percentage.
 * @notice The fee is determined based on the amount transfered. There will be 3 fee levels, for example:
 *   -> 0.1% for transfers <= 10 ETH
 *   -> 0.01% for 10 ETH < transfers <= 100 ETH
 *   -> 0.001% for transfers > 100 ETH
 *
 */
contract PST is Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/
    error PST__NeedsMoreThanZero();
    error PST__NeedsValidAddress();
    error PST__PasswordNotProvided();
    error PST__MinPasswordLengthIsSeven();
    error PST__NotEnoughFunds();
    error PST__TransferFailed();
    error PST__NotEnoughGas();
    error PST__NoAmountToWithdraw();
    error PST__CantSendToOwnAddress();
    error PST__IncorrectPassword();
    error PST__OnlySenderCanCancel();
    error PST__InvalidFeeLevel();
    error PST__InvalidTransferFee();
    error PST_NoFeesToWithdraw();
    error PST_FeeWIthdrawalFailed();
    error PST__TransferIndexDoesNotExist();
    error PST__RefundFailed();
    error PST__InvalidTransferId();
    error PST__TransferNotPending();
    error PST__InvalidReceiver();
    error PST__TransferCanceled();
    error PST__TransferNotCanceled();
    error PST__CooldownPeriodNotElapsed();

    /*//////////////////////////////////////////////////////////////
                          TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/
    using TransferFeeLibrary for TransferFeeLibrary.TransferFeeLevels;

    /*//////////////////////////////////////////////////////////////
                          STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address private immutable i_owner;
    uint256 private s_transferFeeLvlOne;
    uint256 private s_transferFeeLvlTwo;
    uint256 private s_transferFeeLvlThree;
    uint256 private s_feePool;
    uint256 private s_transferCounter;

    uint256 private constant MIN_PASSWORD_LENGTH = 7;
    uint256 private constant CLAIM_COOLDOWN_PERIOD = 30 minutes;
    uint256 private constant REFUND_COOLDOWN_PERIOD = 7 days;

    TransferFeeLibrary.TransferFeeLevels private feeLevels;

    // Mapping of transfer ID to Transfer info struct
    mapping(uint256 transferId => Transfer transfer) private s_transfersById;
    // Mapping of receiver address to total amount claimed
    mapping(address receiver => uint256 totalAmount) private s_receiverTotalAmounts;
    // Mapping of sender address to total amount sent
    mapping(address sender => uint256 totalAmount) private s_senderTotalAmounts;
    // Mapping of transfer Id to last failed claim attempt time
    mapping(uint256 transfrId => uint256 lastFailedClaimAttemptTime) private s_lastFailedClaimAttempt;

    struct Transfer {
        address sender;
        address receiver;
        uint256 amount;
        uint256 creationTime;
        bytes32 encodedPassword;
        bytes32 salt;
        bool isPending;
        bool isCanceled;
    }

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/
    // Event to log a created transfer
    event TransferInitiated(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        uint256 amount,
        uint256 transferFeeCost
    );
    // Event to log a canceled transfer
    event TransferCanceled(
        address indexed sender, address indexed receiver, uint256 indexed transferIndex, uint256 amount
    );
    // Event to log a completed transfer
    event TransferCompleted(
        address indexed sender, address indexed receiver, uint256 indexed transferIndex, uint256 amount
    );

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/
    modifier moreThanZero(uint256 amount) {
        if (amount == 0) {
            revert PST__NeedsMoreThanZero();
        }
        _;
    }

    modifier onlySender(uint256 _transferId) {
        address sender = s_transfersById[_transferId].sender;
        if (!(msg.sender == sender)) {
            revert PST__OnlySenderCanCancel();
        }
        _;
    }

    modifier onlyPendingTransfers(uint256 _transferId) {
        if (_transferId > s_transferCounter) {
            revert PST__InvalidTransferId();
        }

        if (!s_transfersById[_transferId].isPending) {
            revert PST__TransferNotPending();
        }
        _;
    }

    modifier onlyCanceledTransfers(uint256 _transferId) {
        if (_transferId > s_transferCounter) {
            revert PST__InvalidTransferId();
        }

        if (!s_transfersById[_transferId].isCanceled) {
            revert PST__TransferNotCanceled();
        }

        if (s_transfersById[_transferId].isPending) {
            revert PST__TransferNotCanceled();
        }

        if (s_transfersById[_transferId].amount != 0) {
            revert PST__TransferNotCanceled();
        }

        _;
    }

    modifier claimCooldownElapsed(uint256 transferId) {
        uint256 lastAttempt = s_lastFailedClaimAttempt[transferId];
        if (block.timestamp < lastAttempt + CLAIM_COOLDOWN_PERIOD) {
            revert PST__CooldownPeriodNotElapsed();
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    constructor(uint256 _transferFeeLvlOne, uint256 _transferFeeLvlTwo, uint256 _transferFeeLvlThree)
        Ownable(msg.sender)
    {
        feeLevels = TransferFeeLibrary.TransferFeeLevels({
            lvlOne: _transferFeeLvlOne,
            lvlTwo: _transferFeeLvlTwo,
            lvlThree: _transferFeeLvlThree
        });
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     *
     *
     */
    function createTransfer(address receiver, uint256 amount, string memory password)
        external
        payable
        moreThanZero(amount)
        nonReentrant
    {
        if (receiver == address(0)) {
            revert PST__NeedsValidAddress();
        }

        if (receiver == msg.sender) {
            revert PST__CantSendToOwnAddress();
        }

        if (bytes(password).length == 0) {
            revert PST__PasswordNotProvided();
        }

        if (bytes(password).length < MIN_PASSWORD_LENGTH) {
            revert PST__MinPasswordLengthIsSeven();
        }

        uint256 transferId = s_transferCounter++;

        TransferFeeLibrary.TransferFeeLevels memory currentFeeLevels = feeLevels;

        (uint256 totalTransferCost, uint256 transferFeeCost) =
            TransferFeeLibrary.calculateTotalTransferCost(amount, currentFeeLevels);

        if (msg.sender.balance < totalTransferCost) {
            revert PST__NotEnoughFunds();
        }

        (bytes32 encodedPassword, bytes32 salt) = encodePassword(password);

        s_transfersById[transferId] = Transfer({
            sender: msg.sender,
            receiver: receiver,
            amount: amount,
            creationTime: block.timestamp,
            encodedPassword: encodedPassword,
            salt: salt,
            isPending: true,
            isCanceled: false
        });

        addFee(transferFeeCost);

        emit TransferInitiated(msg.sender, receiver, transferId, amount, transferFeeCost);

        (bool success,) = address(this).call{value: totalTransferCost}("");
        if (!success) {
            revert PST__TransferFailed();
        }

        if (msg.value > totalTransferCost) {
            (bool refundSuccess,) = msg.sender.call{value: msg.value - totalTransferCost}("");
            if (!refundSuccess) {
                revert PST__RefundFailed();
            }
        }
    }

    function cancelTransfer(uint256 transferId)
        external
        nonReentrant
        onlySender(transferId)
        onlyPendingTransfers(transferId)
    {
        Transfer storage transferToCancel = s_transfersById[transferId];
        uint256 amountToCancel = transferToCancel.amount;

        if (amountToCancel == 0) {
            revert PST__NoAmountToWithdraw();
        }

        transferToCancel.isPending = false;
        transferToCancel.isCanceled = true;
        transferToCancel.amount = 0;

        emit TransferCanceled(msg.sender, transferToCancel.receiver, transferId, amountToCancel);

        (bool success,) = msg.sender.call{value: amountToCancel}("");
        if (!success) {
            revert PST__TransferFailed();
        }
    }

    function claimTransfer(uint256 transferId, string memory password)
        external
        nonReentrant
        claimCooldownElapsed(transferId)
    {
        Transfer storage transferToClaim = s_transfersById[transferId];
        uint256 amountToClaim = transferToClaim.amount;

        if (amountToClaim == 0) {
            revert PST__NoAmountToWithdraw();
        }

        if (transferToClaim.receiver != msg.sender) {
            revert PST__InvalidReceiver();
        }

        if (!transferToClaim.isPending) {
            revert PST__TransferNotPending();
        }

        if (transferToClaim.isCanceled) {
            revert PST__TransferCanceled();
        }

        if (!checkPassword(transferId, password)) {
            s_lastFailedClaimAttempt[transferId] = block.timestamp;
            revert PST__IncorrectPassword();
        }

        transferToClaim.isPending = false;
        transferToClaim.amount = 0;

        s_senderTotalAmounts[msg.sender] += amountToClaim;
        s_receiverTotalAmounts[msg.sender] += amountToClaim;

        emit TransferCompleted(transferToClaim.sender, msg.sender, transferId, amountToClaim);

        (bool success,) = msg.sender.call{value: amountToClaim}("");
        if (!success) {
            revert PST__TransferFailed();
        }
    }

    function setTransferFee(uint8 level, uint256 newTransferFee) external onlyOwner {
        if (newTransferFee == 0) {
            revert PST__InvalidTransferFee();
        }

        if (level == 1) {
            s_transferFeeLvlOne = newTransferFee;
        } else if (level == 2) {
            s_transferFeeLvlTwo = newTransferFee;
        } else if (level == 3) {
            s_transferFeeLvlThree = newTransferFee;
        } else {
            revert PST__InvalidFeeLevel();
        }
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = s_feePool;

        if (amount == 0) {
            revert PST_NoFeesToWithdraw();
        }

        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) {
            revert PST_FeeWIthdrawalFailed();
        }
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function checkPassword(uint256 transferId, string memory password) internal view returns (bool) {
        (bytes32 receiverPassword,) = encodePassword(password);
        bytes32 senderPassword = s_transfersById[transferId].encodedPassword;

        return senderPassword == receiverPassword;
    }

    function addFee(uint256 _transferFee) internal {
        s_feePool += _transferFee;
    }

    function encodePassword(string memory _password) internal view returns (bytes32, bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));
        bytes32 encodedPassword = keccak256(abi.encodePacked(_password, salt));

        return (encodedPassword, salt);
    }

    function removeCanceledTransfers(uint256 transferId) internal onlyOwner onlyCanceledTransfers(transferId) {
        delete s_transfersById[transferId];
    }

    /*//////////////////////////////////////////////////////////////
                        PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
                        VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    // Function that checks the balance of the contract
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // Function that checks the total fee aquiered by the contract
    function getTotalFee() public view returns (uint256) {
        return s_feePool;
    }

    function getTransferFee(uint8 level) external view returns (uint256) {
        if (level == 1) {
            return s_transferFeeLvlOne;
        } else if (level == 2) {
            return s_transferFeeLvlTwo;
        } else if (level == 3) {
            return s_transferFeeLvlThree;
        } else {
            revert PST__InvalidFeeLevel();
        }
    }

    function calculateTotalTransferCostPublic(uint256 amount)
        external
        view
        returns (uint256 totalTransferCost, uint256 transferFeeCost)
    {
        return TransferFeeLibrary.calculateTotalTransferCost(amount, feeLevels);
    }

    function isPendingTransfer(uint256 transferId) external view returns (bool) {
        return s_transfersById[transferId].isPending;
    }

    function isCanceledTransfer(uint256 transferId) external view returns (bool) {
        return s_transfersById[transferId].isCanceled;
    }

    function getClaimCooldownStatus(uint256 transferId)
        external
        view
        returns (bool isCoolDownActive, uint256 timeRemaining)
    {
        uint256 lastAttempt = s_lastFailedClaimAttempt[transferId];
        if (block.timestamp < lastAttempt + CLAIM_COOLDOWN_PERIOD) {
            return (true, (lastAttempt + CLAIM_COOLDOWN_PERIOD) - block.timestamp);
        }
        return (false, 0);
    }
}

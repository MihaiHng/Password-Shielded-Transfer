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
 * @dev This smart contract is the core of the PST(Password Shielded Transfer) Platform
 * The main functionality of this system is the addition of an extra security layer to tranfer operations
 * A Password Shielded Transfer will require the following steps:
 *  - [Person A] creates a transfer with the following transfer details:
 *      - address of [Person B]
 *      - [amount] transfered
 *      - [password]
 *  - [Person A] sends the [secure password] to Person B by a communication method of its choice(whatsapp, email, phonecall etc.)
 *  - At this point there is a transfer created in the system, waiting to be unlocked and claimed with the [password] provided by [Person A]
 *  - [Person A] has the possibility to [cancel] the transfer if they change their mind, as long as [Berson B] didn't claim it
 *  - [Person B] accesses the pending transfer and enters the [secure password] received from [Person A]
 *  - If the password entered by [Person B] matches the password which was set up by [Person A] the transfer will be unlocked for [Person B]
 *  - At this point [Person B] can claim [amount] sent by [Person A]
 *
 * @notice The added layer of security provided by the [secure password] allows [Person A] to cancel the tranfer and claim back the [amount] at any point before the receiver [Person B] claims the [amount]
 * @notice The platform will charge a fee per transfer. The fee is calculated as a percentage.
 * @notice The fee is determined based on the amount transfered. There will be 3 fee levels, for example:
 *   -> 0.01 for transfers <= 10 ETH
 *   -> 0.001 for 10 ETH < transfers <= 100 ETH
 *   -> 0.0001 for transfers > 100 ETH
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
    error PST__TRansferNotPending();

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

    uint256 private constant MINPASSWORDLENGTH = 7;

    TransferFeeLibrary.TransferFeeLevels private feeLevels;

    // Mapping of receiver address to transfer index
    mapping(address receiver => uint256 transferIndex) private s_receiverTransferIndexes;
    // Mapping of receiver address to indexed transfer amount to claim
    mapping(address receiver => mapping(uint256 transferIndex => uint256 amountToClaim)) private
        s_receiverIndexedAmountToClaim;
    // Mapping of receiver address to indexed transfer password set by sender
    mapping(address receiver => mapping(uint256 transferIndex => bytes32 encodedPassword)) private
        s_indexedEncodedPasswords;
    // Mapping of receiever address to indexed transfer and unique salt for password encoding
    mapping(address receiver => mapping(uint256 transferIndex => bytes32 salt)) private s_indexedSalts;
    // Mapping of receiver address to transfer index and its pending transfer status false/true
    mapping(address receiver => mapping(uint256 transferIndex => bool pendingTransfer)) private s_pendingTransfers;
    // Mapping of sender address to receiver address and transfer index to get the sender of a transfer
    mapping(address sender => mapping(uint256 transferIndex => address receiver)) private s_senders;

    //Mapping of sender-receiver pair and the coresponding array of transfer indexes
    mapping(address sender => mapping(address receiver => Transfer[])) private s_transfers;

    // Mapping of transfer ID to Transfer struct
    mapping(uint256 transferId => Transfer transfer) private s_transfersById;

    // @dev Mapping of receiver address to total amount claimed
    mapping(address receiver => uint256 totalAmount) private s_receiverTotalAmounts;
    // @dev Mapping of sender address to total amount sent
    mapping(address sender => uint256 totalAmount) private s_senderTotalAmounts;

    struct Transfer {
        address sender;
        address receiver;
        uint256 amount;
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

        if (!(s_transfersById[_transferId].isPending)) {
            revert PST__TRansferNotPending();
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

        if (bytes(password).length < MINPASSWORDLENGTH) {
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
            encodedPassword: encodedPassword,
            salt: salt,
            isPending: true,
            isCanceled: false
        });

        s_senderTotalAmounts[msg.sender] += amount;

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

    function cancelTransfer(address receiver, uint256 transferIndex) external nonReentrant onlySender(transferIndex) {
        Transfer storage transferToCancel = s_transfers[msg.sender][receiver][transferIndex];
        uint256 amountToCancel = transferToCancel.amount;

        if (amountToCancel == 0) {
            revert PST__NoAmountToWithdraw();
        }

        //removeTransferIndex(receiver, transferIndex);

        // delete s_receiverIndexedAmountToClaim[receiver][transferIndex];
        // delete s_indexedEncodedPasswords[receiver][transferIndex];
        // delete s_senders[receiver][transferIndex];

        transferToCancel.isPending = false;
        transferToCancel.amount = 0;

        s_senderTotalAmounts[msg.sender] -= amountToCancel;

        emit TransferCanceled(msg.sender, receiver, transferIndex, amountToCancel);

        (bool success,) = msg.sender.call{value: amountToCancel}("");
        if (!success) {
            revert PST__TransferFailed();
        }
    }

    function claimTransfer(uint256 transferIndex, string memory password) external nonReentrant {
        uint256 amountToClaim = s_receiverIndexedAmountToClaim[msg.sender][transferIndex];
        address sender = s_senders[msg.sender][transferIndex];

        if (amountToClaim == 0) {
            revert PST__NoAmountToWithdraw();
        }

        if (!checkPassword(transferIndex, password)) {
            revert PST__IncorrectPassword();
        }

        delete s_receiverIndexedAmountToClaim[msg.sender][transferIndex];
        delete s_indexedEncodedPasswords[msg.sender][transferIndex];

        // removeTransferIndex(msg.sender, transferIndex);
        s_receiverTotalAmounts[msg.sender] += amountToClaim;

        emit TransferCompleted(sender, msg.sender, transferIndex, amountToClaim);

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

    function removeCanceledTransfers() external onlyOwner {}

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function checkPassword(uint256 index, string memory password) internal view returns (bool) {
        (bytes32 receiverPassword,) = encodePassword(password);

        return s_indexedEncodedPasswords[msg.sender][index] == receiverPassword;
    }

    function addFee(uint256 _transferFee) internal {
        s_feePool += _transferFee;
    }

    function encodePassword(string memory _password) internal view returns (bytes32, bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));
        //s_encodedPasswords[msg.sender][index] = keccak256(abi.encodePacked(_password));
        bytes32 encodedPassword = keccak256(abi.encodePacked(_password, salt));

        return (encodedPassword, salt);
    }

    /*//////////////////////////////////////////////////////////////
                        PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function addPendingTransfer(address receiver, uint256 transferIndex) private {
        s_pendingTransfers[receiver][transferIndex] = true;
    }

    // function removeTransferIndex(address receiver, uint256 transferIndex) private {
    //     if (s_pendingTransfers[receiver][transferIndex] = false) {
    //         revert PST__TransferIndexDoesNotExist();
    //     }
    //     s_pendingTransfers[receiver][transferIndex] = false;
    // }

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

    function isPendingTransfer(address receiver, uint256 transferIndex) external view returns (bool) {
        return s_pendingTransfers[receiver][transferIndex];
    }

    function getTransfers(address sender, address receiver) external view returns (Transfer[] memory) {
        return s_transfers[sender][receiver];
    }
}

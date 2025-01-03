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

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// Complete events
// Test chainlink automation, Use the Forwarder(Chainlink Automation Best Practices)
// Add functionality for ERC20 tokens
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * @title PST Password Shielded Transfer
 * @author Mihai Hanga
 *
 * @dev This smart contract is the core of the Password Shielded Transfer(PST)
 * The main functionality of this system is the use of passwords to increase the security of transfers between two parties
 * This solution aims to help with the security of high value transfers, trying to allow the sender a second  chance if they
 * made a "0" mistake or if simply, they changed their mind in the process
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
    error PST__InvalidAddress();
    error PST__PasswordNotProvided();
    error PST__MinPasswordLengthIsSeven();
    error PST__TransferFailed();
    error PST__NoAmountToRefund();
    error PST__CantSendToOwnAddress();
    error PST__IncorrectPassword();
    error PST__OnlySenderCanCancel();
    error PST__InvalidFeeLevel();
    error PST__FeeWIthdrawalFailed();
    error PST__RefundFailed();
    error PST__InvalidTransferId();
    error PST__TransferNotPending();
    error PST__InvalidReceiver();
    error PST__CooldownPeriodNotElapsed();
    error PST__NotEnoughFunds(uint256 required, uint256 provided);
    error PST__NoExpiredTransfersToRemove();
    error PST__NoCanceledTransfersToRemove();
    error PST__NoClaimedTransfersToRemove();
    error PST__NoPendingTransfers();
    error PST__NoCanceledTransfers();
    error PST__NoExpiredTransfers();
    error PST__NoClaimedTransfers();
    error PST__TransferNotFound();

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
    uint256 private s_lastCanceledTransfersByAddressRemoval;
    uint256 private s_lastExpiredAndRefundedTransfersByAddressRemoval;
    uint256 private s_lastClaimedTransfersByAddressRemoval;

    uint256 private constant MIN_PASSWORD_LENGTH = 7;
    uint256 private constant CLAIM_COOLDOWN_PERIOD = 30 minutes;
    uint256 private constant BEFORE_EXPIRING_PERIOD = 7 days; // needs to be at least 24 hours to allow enough time for a receiver to claim
    uint256 private constant USER_TRANSFERS_HISTORY_LIFE = 12 weeks;

    uint256[] private s_pendingTransferIds;
    uint256[] private s_canceledTransferIds;
    uint256[] private s_expiredAndRefundedTransferIds;
    uint256[] private s_claimedTransferIds;

    TransferFeeLibrary.TransferFeeLevels private feeLevels;

    // Mapping to track if a transfer is pending
    mapping(uint256 transferId => bool) private s_isPending;
    // Mapping to track if a transfer is canceled
    mapping(uint256 transferId => bool) private s_isCanceled;
    // Mapping to track if a transfer is expired
    mapping(uint256 transferId => bool) private s_isExpiredAndRefunded;
    // Mapping to track if a transfer is claimed
    mapping(uint256 transferId => bool) private s_isClaimed;

    // Mapping to track all the pending transfers for an address
    mapping(address user => uint256[] transferIds) private s_pendingTransfersByAddress;
    // Mapping to track all canceled transfers for an address
    mapping(address user => uint256[] transferIds) private s_canceledTransfersByAddress;
    // Mapping to track all expired transfers for an address
    mapping(address user => uint256[] transferIds) private s_expiredAndRefundedTransfersByAddress;
    // Mapping to track all claimed transfers for an address
    mapping(address user => uint256[] transferIds) private s_claimedTransfersByAddress;

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
        // token
        uint256 amount;
        uint256 creationTime;
        uint256 expiringTime;
        bytes32 encodedPassword;
        bytes32 salt;
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

    // Event to log an expired transfer
    event TransferExpired(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        uint256 amount,
        uint256 expiringTime
    );

    // Event to log a successful fee withdrawal
    event SuccessfulFeeWithdrawal(address owner, uint256 feePool, uint256 withdrawalTime);

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/
    modifier moreThanZero(uint256 entry) {
        if (entry == 0) {
            revert PST__NeedsMoreThanZero();
        }
        _;
    }

    modifier onlySender(uint256 transferId) {
        address sender = s_transfersById[transferId].sender;
        if (!(msg.sender == sender)) {
            revert PST__OnlySenderCanCancel();
        }
        _;
    }

    modifier onlyPendingTransfers(uint256 transferId) {
        if (!s_isPending[transferId]) {
            revert PST__TransferNotPending();
        }
        _;
    }

    modifier onlyValidTransferIds(uint256 transferId) {
        if (transferId > s_transferCounter) {
            revert PST__InvalidTransferId();
        }
        _;
    }

    modifier onlyValidAddress(address user) {
        if (user == address(0)) {
            revert PST__InvalidAddress();
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
        nonReentrant
        onlyValidAddress(receiver)
        moreThanZero(amount)
    {
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

        if (msg.value < totalTransferCost) {
            revert PST__NotEnoughFunds({required: totalTransferCost, provided: msg.value});
        }

        (bytes32 encodedPassword, bytes32 salt) = encodePassword(password);

        s_transfersById[transferId] = Transfer({
            sender: msg.sender,
            receiver: receiver,
            //token:
            amount: amount,
            creationTime: block.timestamp,
            expiringTime: block.timestamp + BEFORE_EXPIRING_PERIOD,
            encodedPassword: encodedPassword,
            salt: salt
        });

        s_isPending[transferId] = true;
        s_pendingTransferIds.push(transferId);
        s_pendingTransfersByAddress[msg.sender].push(transferId);
        s_pendingTransfersByAddress[receiver].push(transferId);

        addFee(transferFeeCost);

        emit TransferInitiated(msg.sender, receiver, transferId, /* token */ amount, transferFeeCost);

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
        onlyValidTransferIds(transferId)
    {
        Transfer storage transferToCancel = s_transfersById[transferId];
        uint256 amountToCancel = transferToCancel.amount;

        s_isPending[transferId] = false;
        s_isCanceled[transferId] = true;
        transferToCancel.amount = 0;
        s_canceledTransferIds.push(transferId);

        address receiver = s_transfersById[transferId].receiver;
        s_canceledTransfersByAddress[msg.sender].push(transferId);
        s_canceledTransfersByAddress[receiver].push(transferId);

        removeFromPendingTransfers(transferId);
        removeFromPendingTransfersByAddress(msg.sender, transferId);
        removeFromPendingTransfersByAddress(receiver, transferId);

        emit TransferCanceled(msg.sender, transferToCancel.receiver, transferId, /* token */ amountToCancel);

        (bool success,) = msg.sender.call{value: amountToCancel}("");
        if (!success) {
            revert PST__TransferFailed();
        }
    }

    function claimTransfer(uint256 transferId, string memory password)
        external
        nonReentrant
        claimCooldownElapsed(transferId)
        onlyPendingTransfers(transferId)
    {
        Transfer storage transferToClaim = s_transfersById[transferId];
        uint256 amountToClaim = transferToClaim.amount;

        if (transferToClaim.receiver != msg.sender) {
            revert PST__InvalidReceiver();
        }

        if (!checkPassword(transferId, password)) {
            s_lastFailedClaimAttempt[transferId] = block.timestamp;
            revert PST__IncorrectPassword();
        }

        s_isPending[transferId] = false;
        s_isClaimed[transferId] = true;
        transferToClaim.amount = 0;
        s_claimedTransferIds.push(transferId);

        address sender = s_transfersById[transferId].sender;
        s_claimedTransfersByAddress[sender].push(transferId);
        s_claimedTransfersByAddress[msg.sender].push(transferId);

        removeFromPendingTransfers(transferId);
        removeFromPendingTransfersByAddress(sender, transferId);
        removeFromPendingTransfersByAddress(msg.sender, transferId);

        s_senderTotalAmounts[msg.sender] += amountToClaim;
        s_receiverTotalAmounts[msg.sender] += amountToClaim;

        emit TransferCompleted(transferToClaim.sender, msg.sender, transferId, /* token */ amountToClaim);

        (bool success,) = msg.sender.call{value: amountToClaim}("");
        if (!success) {
            revert PST__TransferFailed();
        }
    }

    function setTransferFee(uint8 level, uint256 newTransferFee) external onlyOwner moreThanZero(newTransferFee) {
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

    function withdrawFees() external onlyOwner nonReentrant moreThanZero(s_feePool) {
        uint256 amount = s_feePool;

        s_feePool = 0;

        emit SuccessfulFeeWithdrawal(msg.sender, amount, block.timestamp);

        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) {
            revert PST__FeeWIthdrawalFailed();
        }
    }

    /**
     * @dev This is the function that the Chainlink Automation nodes call
     * they look for `upkeepNeeded` to return True.
     * the following should be true for this to return true:
     * 1. The time interval has passed between raffle runs.
     * 2. The lottery is open.
     * 3. The contract has ETH.
     * 4. Implicity, your subscription is funded with LINK.
     */
    function checkUpkeep(bytes calldata /* checkData */ )
        external
        view
        returns (bool upKeepNeeded, bytes memory performData)
    {
        uint256[] memory expiredTransfers = getExpiredTransfers();
        upKeepNeeded = expiredTransfers.length > 0;
        performData = abi.encode(expiredTransfers);
    }

    function performUpkeep(bytes calldata performData) external {
        uint256[] memory expiredTransfers = abi.decode(performData, (uint256[]));
        for (uint256 i = 0; i < expiredTransfers.length; i++) {
            refundExpiredTransfer(expiredTransfers[i]);
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

    function addFee(uint256 _transferFeeCost) internal {
        s_feePool += _transferFeeCost;
    }

    function encodePassword(string memory _password) internal view returns (bytes32, bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));
        bytes32 encodedPassword = keccak256(abi.encodePacked(_password, salt));

        return (encodedPassword, salt);
    }

    function refundExpiredTransfer(uint256 transferId) internal onlyValidTransferIds(transferId) {
        Transfer storage transferToRefund = s_transfersById[transferId];
        uint256 amountToRefund = transferToRefund.amount;

        if (amountToRefund == 0) {
            revert PST__NoAmountToRefund();
        }

        s_isExpiredAndRefunded[transferId] = true;
        s_isPending[transferId] = false;
        transferToRefund.amount = 0;
        s_expiredAndRefundedTransferIds.push(transferId);

        address sender = transferToRefund.sender;
        address receiver = transferToRefund.receiver;
        s_expiredAndRefundedTransfersByAddress[sender].push(transferId);
        s_expiredAndRefundedTransfersByAddress[receiver].push(transferId);
        removeFromPendingTransfers(transferId);
        removeFromPendingTransfersByAddress(sender, transferId);
        removeFromPendingTransfersByAddress(receiver, transferId);

        emit TransferExpired(
            transferToRefund.sender,
            transferToRefund.receiver,
            transferId,
            /* token */
            amountToRefund,
            transferToRefund.expiringTime
        );

        (bool success,) = transferToRefund.sender.call{value: amountToRefund}("");
        if (!success) {
            revert PST__RefundFailed();
        }
    }

    // Function to remove all canceled transfers
    function removeAllCanceledTransfers() internal onlyOwner {
        uint256 length = s_canceledTransferIds.length;

        if (length == 0) {
            revert PST__NoCanceledTransfersToRemove();
        }

        for (uint256 i = 0; i < length; i++) {
            uint256 transferId = s_canceledTransferIds[i];
            delete s_isCanceled[transferId];
            delete s_transfersById[transferId];
        }

        delete s_canceledTransferIds;
    }

    // Function to remove all expired transfers
    function removeAllExpiredTransfers() internal onlyOwner {
        uint256 length = s_expiredAndRefundedTransferIds.length;

        if (length == 0) {
            revert PST__NoExpiredTransfersToRemove();
        }

        for (uint256 i = 0; i < length; i++) {
            uint256 transferId = s_expiredAndRefundedTransferIds[i];
            delete s_isExpiredAndRefunded[transferId];
            delete s_transfersById[transferId];
        }

        delete s_expiredAndRefundedTransferIds;
    }

    // Function to remove all claimed transfers
    function removeAllClaimedTransfers() internal onlyOwner {
        uint256 length = s_claimedTransferIds.length;

        if (length == 0) {
            revert PST__NoClaimedTransfersToRemove();
        }

        for (uint256 i = 0; i < length; i++) {
            uint256 transferId = s_claimedTransferIds[i];
            delete s_isClaimed[transferId];
            delete s_transfersById[transferId];
        }

        delete s_claimedTransferIds;
    }

    function removeFromPendingTransfersByAddress(address user, uint256 transferId) internal {
        uint256[] storage userPendingTransfers = s_pendingTransfersByAddress[user];
        uint256 length = userPendingTransfers.length;
        if (length == 0) {
            revert PST__NoPendingTransfers();
        }

        for (uint256 i = 0; i < length; i++) {
            if (userPendingTransfers[i] == transferId) {
                userPendingTransfers[i] = userPendingTransfers[length - 1];
                userPendingTransfers.pop();
                break;
            }
        }
    }

    function removeFromPendingTransfers(uint256 transferId) internal {
        uint256[] storage pendingTransfers = s_pendingTransferIds;
        uint256 length = pendingTransfers.length;
        if (length == 0) {
            revert PST__NoPendingTransfers();
        }

        for (uint256 i = 0; i < length; i++) {
            if (pendingTransfers[i] == transferId) {
                pendingTransfers[i] = pendingTransfers[length - 1];
                pendingTransfers.pop();
                break;
            }
        }
    }

    function removeAllCanceledTransfersByAddress(address user) internal onlyValidAddress(user) {
        if (s_canceledTransfersByAddress[user].length == 0) {
            revert PST__NoCanceledTransfers();
        }

        s_lastCanceledTransfersByAddressRemoval = block.timestamp;

        delete s_canceledTransfersByAddress[user];
    }

    function removeAllExpiredAndRefundedTransfersByAddress(address user) internal onlyValidAddress(user) {
        if (s_expiredAndRefundedTransfersByAddress[user].length == 0) {
            revert PST__NoExpiredTransfers();
        }

        s_lastExpiredAndRefundedTransfersByAddressRemoval = block.timestamp;

        delete s_expiredAndRefundedTransfersByAddress[user];
    }

    function removeAllClaimedTransfersByAddress(address user) internal onlyValidAddress(user) {
        if (s_claimedTransfersByAddress[user].length == 0) {
            revert PST__NoClaimedTransfers();
        }

        s_lastClaimedTransfersByAddressRemoval = block.timestamp;

        delete s_claimedTransfersByAddress[user];
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
        public
        view
        returns (uint256 totalTransferCost, uint256 transferFeeCost)
    {
        return TransferFeeLibrary.calculateTotalTransferCost(amount, feeLevels);
    }

    // Function to check if a specific transfer is pending
    function isPendingTransfer(uint256 transferId) public view returns (bool) {
        return s_isPending[transferId];
    }

    // Function to check if a specific transfer is canceled
    function isCanceledTransfer(uint256 transferId) public view returns (bool) {
        return s_isCanceled[transferId];
    }

    // Function to check if a specific transfer is expired
    function isExpiredAndRefundedTransfer(uint256 transferId) public view returns (bool) {
        return s_isExpiredAndRefunded[transferId];
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

    // Function to get all pending transfers in the system
    function getPendingTransfers() public view returns (uint256[] memory) {
        return s_pendingTransferIds;
    }

    // Function to get all canceled transfers in the system
    function getCanceledTransfers() public view returns (uint256[] memory) {
        return s_canceledTransferIds;
    }

    // Function to get all expired transfers in the system
    function getExpiredAndRefundedTransfers() public view returns (uint256[] memory) {
        return s_expiredAndRefundedTransferIds;
    }

    // Function to get all expired transfers in the system
    function getExpiredTransfers() public view returns (uint256[] memory) {
        uint256 expiredCount;

        for (uint256 i = 0; i < s_pendingTransferIds.length; i++) {
            uint256 transferId = s_pendingTransferIds[i];
            if (block.timestamp >= s_transfersById[transferId].expiringTime) {
                expiredCount++;
            }
        }

        uint256[] memory expiredTransfers = new uint256[](expiredCount);
        uint256 index;

        for (uint256 i = 0; i < s_pendingTransferIds.length; i++) {
            uint256 transferId = s_pendingTransferIds[i];
            if (block.timestamp >= s_transfersById[transferId].expiringTime) {
                expiredTransfers[index] = transferId;
                index++;
            }
        }

        return expiredTransfers;
    }

    // Function to get all claimed transfers in the system
    function getClaimedTransfers() public view returns (uint256[] memory) {
        return s_claimedTransferIds;
    }

    // Function to get all pending transfers for an address
    function getPendingTransfersForAddress(address user)
        public
        view
        onlyValidAddress(user)
        returns (uint256[] memory)
    {
        if (s_pendingTransfersByAddress[user].length == 0) {
            revert PST__NoPendingTransfers();
        }

        return s_pendingTransfersByAddress[user];
    }

    // Function to get all canceled transfers for an address
    function getCanceledTransfersForAddress(address user)
        public
        view
        onlyValidAddress(user)
        returns (uint256[] memory)
    {
        if (s_canceledTransfersByAddress[user].length == 0) {
            revert PST__NoCanceledTransfers();
        }

        return s_canceledTransfersByAddress[user];
    }

    // Function to get all expired transfers for an address
    function getExpiredTransfersForAddress(address user)
        public
        view
        onlyValidAddress(user)
        returns (uint256[] memory)
    {
        if (s_expiredAndRefundedTransfersByAddress[user].length == 0) {
            revert PST__NoExpiredTransfers();
        }

        return s_expiredAndRefundedTransfersByAddress[user];
    }

    // Function to get all claimed transfers for an address
    function getClaimedTransfersForAddress(address user)
        public
        view
        onlyValidAddress(user)
        returns (uint256[] memory)
    {
        if (s_claimedTransfersByAddress[user].length == 0) {
            revert PST__NoClaimedTransfers();
        }

        return s_claimedTransfersByAddress[user];
    }

    // Function to get all transfers for an address
    function getAllTransfersByAddress(address user)
        external
        view
        onlyValidAddress(user)
        returns (
            uint256[] memory pending,
            uint256[] memory canceled,
            uint256[] memory expired,
            uint256[] memory claimed
        )
    {
        pending = s_pendingTransfersByAddress[user];
        canceled = s_canceledTransfersByAddress[user];
        expired = s_expiredAndRefundedTransfersByAddress[user];
        claimed = s_claimedTransfersByAddress[user];
    }

    // Function to get transfer details for a specific transfer Id
    function getTransferDetails(uint256 transferId)
        external
        view
        onlyValidTransferIds(transferId)
        returns (
            address sender,
            address receiver,
            /* token */
            uint256 amount,
            uint256 creationTime,
            uint256 expiringTime,
            string memory state
        )
    {
        if (s_transfersById[transferId].creationTime == 0) {
            revert PST__TransferNotFound();
        }

        Transfer memory transfer = s_transfersById[transferId];

        if (s_isClaimed[transferId]) {
            state = "Claimed";
        } else if (s_isCanceled[transferId]) {
            state = "Canceled";
        } else if (s_isExpiredAndRefunded[transferId]) {
            state = "ExpiredAndRefunded";
        } else if (s_isPending[transferId]) {
            state = "Pending";
        } else {
            state = "Unknown";
        }

        return (
            transfer.sender,
            transfer.receiver,
            /* token */
            transfer.amount,
            transfer.creationTime,
            transfer.expiringTime,
            state
        );
    }
}

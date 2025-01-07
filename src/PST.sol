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
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// Update Fees management for different ERC20 tokens
// Complete events
// Test chainlink automation, Use the Forwarder(Chainlink Automation Best Practices)
// Batch processing
// Add functionality for ERC20 tokens
// Setters funtions for important parameters
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * UI Considerations:
 * - Create a file to cache token metadata to avoid redundant calls:
 * {
 *     "address": "0xTokenAddress1",
 *     "name": "USDT",
 *     "symbol": "Tether",
 *     "decimals": 6
 *    }
 */

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
    error PST__PasswordTooShort(uint256 minCharactersRequired);
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
    error PST__InvalidClaimCooldownPeriod(uint256 minRequired);
    error PST__InvalidAvailabilityPeriod(uint256 minRequired);
    error PST__InvalidCleanupInterval(uint256 minRequired);
    error PST__InvalidInactivityThreshhold(uint256 minRequired);
    error PST__NotEnoughFunds(uint256 required, uint256 provided);
    error PST__NoExpiredTransfersToRemove();
    error PST__NoCanceledTransfersToRemove();
    error PST__NoClaimedTransfersToRemove();
    error PST__NoPendingTransfers();
    error PST__NoCanceledTransfers();
    error PST__NoExpiredTransfers();
    error PST__NoClaimedTransfers();
    error PST__TransferNotFound();
    error PST__TokenAlreadyWhitelisted();
    error PST__TokenNotAllowed();
    error PST__InsufficientFeeBalance();

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
    // uint256 private s_feePool;
    uint256 private s_transferCounter;

    uint256 private s_MIN_PASSWORD_LENGTH = REQ_MIN_PASSWORD_LENGTH;
    uint256 private s_CLAIM_COOLDOWN_PERIOD = 30 minutes;
    uint256 private s_AVAILABILITY_PERIOD = 7 days;
    uint256 private s_CLEANUP_INTERVAL = 12 weeks;
    uint256 private s_INACTIVITY_THRESHOLD = 12 weeks;

    uint256 private constant REQ_MIN_PASSWORD_LENGTH = 7;
    uint256 private constant MIN_CLAIM_COOLDOWN_PERIOD = 15 minutes;
    uint256 private constant MIN_AVAILABILITY_PERIOD = 1 days;
    uint256 private constant MIN_CLEANUP_INTERVAL = 1 weeks;
    uint256 private constant MIN_INACTIVITY_THRESHOLD = 1 weeks;

    uint256[] private s_pendingTransferIds;
    uint256[] private s_canceledTransferIds;
    uint256[] private s_expiredAndRefundedTransferIds;
    uint256[] private s_claimedTransferIds;
    address[] private s_addressList;
    address[] private s_tokenList;

    TransferFeeLibrary.TransferFeeLevels private feeLevels;

    struct Transfer {
        address sender;
        address receiver;
        address token;
        uint256 amount;
        uint256 creationTime;
        uint256 expiringTime;
        bytes32 encodedPassword;
        bytes32 salt;
    }

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
    // Mapping to track all expired and refunded transfers for an address
    mapping(address user => uint256[] transferIds) private s_expiredAndRefundedTransfersByAddress;
    // Mapping to track all claimed transfers for an address
    mapping(address user => uint256[] transferIds) private s_claimedTransfersByAddress;

    // Mapping of transfer ID to Transfer info struct
    mapping(uint256 transferId => Transfer transfer) private s_transfersById;
    // Mapping of transfer Id to last failed claim attempt time
    mapping(uint256 transfrId => uint256 lastFailedClaimAttemptTime) private s_lastFailedClaimAttempt;
    // Mapping to track active addresses
    mapping(address user => bool) private s_trackedAddresses;
    // Mapping to track an address to its last cleanup time
    mapping(address user => uint256 lastCleanupTime) private s_lastCleanupTimeByAddress;
    // Mapping to track an address to its last active time
    mapping(address user => uint256 lastActiveTime) private s_lastInteractionTime;

    // Mapping to track if a token address is whitelisted
    mapping(address tokenAddress => bool isWhitelisted) private s_allowedTokens;
    // Mappping to track the accumulated fees for each token allowed in whitelist
    mapping(address token => uint256 feeBalance) private s_feeBalances;

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/
    // Event to log a created transfer
    event TransferInitiated(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount,
        uint256 transferFeeCost
    );
    // Event to log a canceled transfer
    event TransferCanceled(
        address indexed sender, address indexed receiver, uint256 indexed transferIndex, address token, uint256 amount
    );
    // Event to log a completed transfer
    event TransferCompleted(
        address indexed sender, address indexed receiver, uint256 indexed transferIndex, address token, uint256 amount
    );

    // Event to log an expired transfer
    event TransferExpiredAndRefunded(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount,
        uint256 expiringTime
    );

    // Event to log a successful fee withdrawal
    event SuccessfulFeeWithdrawal(address indexed token, uint256 indexed amount);

    // Event to log a token being whitelisted
    event TokenAddedToAllowList(address token);

    // Event to log a token being removed from whitelist
    event TokenRemovedFromAllowList(address token);

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
        if (block.timestamp < lastAttempt + s_CLAIM_COOLDOWN_PERIOD) {
            revert PST__CooldownPeriodNotElapsed();
        }
        _;
    }

    modifier onlyValidToken(address token) {
        if (!s_allowedTokens[token]) {
            revert PST__TokenNotAllowed();
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

        s_allowedTokens[address(0)] = true;

        /**
         * Initialize an ERC20 list of preapproved tokens
         */
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     *
     *
     */
    function createTransfer(address receiver, address token, uint256 amount, string memory password)
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

        if (bytes(password).length < s_MIN_PASSWORD_LENGTH) {
            revert PST__PasswordTooShort({minCharactersRequired: s_MIN_PASSWORD_LENGTH});
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
            token: token,
            amount: amount,
            creationTime: block.timestamp,
            expiringTime: block.timestamp + s_AVAILABILITY_PERIOD,
            encodedPassword: encodedPassword,
            salt: salt
        });

        s_isPending[transferId] = true;
        s_pendingTransferIds.push(transferId);
        s_pendingTransfersByAddress[msg.sender].push(transferId);
        s_pendingTransfersByAddress[receiver].push(transferId);

        addFee(token, transferFeeCost);
        addAddressToTracking(msg.sender);
        s_lastInteractionTime[msg.sender] = block.timestamp;

        emit TransferInitiated(msg.sender, receiver, transferId, token, amount, transferFeeCost);

        if (token == address(0)) {
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
        } else {
            IERC20 erc20 = IERC20(token);
            bool success = erc20.transferFrom(msg.sender, address(this), totalTransferCost);
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
    }

    function cancelTransfer(uint256 transferId)
        external
        nonReentrant
        onlySender(transferId)
        onlyPendingTransfers(transferId)
        onlyValidTransferIds(transferId)
    {
        Transfer storage transferToCancel = s_transfersById[transferId];
        address receiver = transferToCancel.receiver;
        address tokenToCancel = transferToCancel.token;
        uint256 amountToCancel = transferToCancel.amount;

        s_isPending[transferId] = false;
        s_isCanceled[transferId] = true;
        transferToCancel.amount = 0;
        s_canceledTransferIds.push(transferId);

        s_canceledTransfersByAddress[msg.sender].push(transferId);
        s_canceledTransfersByAddress[receiver].push(transferId);

        removeFromPendingTransfers(transferId);
        removeFromPendingTransfersByAddress(msg.sender, transferId);
        removeFromPendingTransfersByAddress(receiver, transferId);

        s_lastInteractionTime[msg.sender] = block.timestamp;

        emit TransferCanceled(msg.sender, receiver, transferId, tokenToCancel, amountToCancel);

        if (tokenToCancel == address(0)) {
            (bool success,) = msg.sender.call{value: amountToCancel}("");
            if (!success) {
                revert PST__TransferFailed();
            }
        } else {
            IERC20 erc20 = IERC20(tokenToCancel);
            bool success = erc20.transferFrom(address(this), msg.sender, amountToCancel);
            if (!success) {
                revert PST__TransferFailed();
            }
        }
    }

    function claimTransfer(uint256 transferId, string memory password)
        external
        nonReentrant
        claimCooldownElapsed(transferId)
        onlyPendingTransfers(transferId)
        onlyValidTransferIds(transferId)
    {
        Transfer storage transferToClaim = s_transfersById[transferId];
        address sender = transferToClaim.sender;
        address tokenToClaim = transferToClaim.token;
        uint256 amountToClaim = transferToClaim.amount;

        if (transferToClaim.receiver != msg.sender) {
            revert PST__InvalidReceiver();
        }

        if (bytes(password).length == 0) {
            revert PST__PasswordNotProvided();
        }

        if (bytes(password).length < s_MIN_PASSWORD_LENGTH) {
            revert PST__PasswordTooShort({minCharactersRequired: s_MIN_PASSWORD_LENGTH});
        }

        if (!checkPassword(transferId, password)) {
            s_lastFailedClaimAttempt[transferId] = block.timestamp;
            revert PST__IncorrectPassword();
        }

        s_isPending[transferId] = false;
        s_isClaimed[transferId] = true;
        transferToClaim.amount = 0;
        s_claimedTransferIds.push(transferId);

        s_claimedTransfersByAddress[sender].push(transferId);
        s_claimedTransfersByAddress[msg.sender].push(transferId);

        removeFromPendingTransfers(transferId);
        removeFromPendingTransfersByAddress(sender, transferId);
        removeFromPendingTransfersByAddress(msg.sender, transferId);

        addAddressToTracking(msg.sender);

        s_lastInteractionTime[msg.sender] = block.timestamp;

        emit TransferCompleted(sender, msg.sender, transferId, tokenToClaim, amountToClaim);

        if (tokenToClaim == address(0)) {
            (bool success,) = msg.sender.call{value: amountToClaim}("");
            if (!success) {
                revert PST__TransferFailed();
            }
        } else {
            IERC20 erc20 = IERC20(tokenToClaim);
            bool success = erc20.transferFrom(address(this), msg.sender, amountToClaim);
            if (!success) {
                revert PST__TransferFailed();
            }
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
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256[] memory expiredTransfers = getExpiredTransfers();
        bool refundNeeded = expiredTransfers.length > 0;

        address[] memory trackedAddresses = s_addressList;
        address[] memory addressesReadyForCleanup = new address[](trackedAddresses.length);
        address[] memory addressesReadyToBeRemoved = new address[](trackedAddresses.length);
        uint256 countaddressesReadyForCleanup;
        uint256 countAddressesToBeRemoved;

        for (uint256 i = 0; i < trackedAddresses.length; i++) {
            address user = trackedAddresses[i];

            if ((block.timestamp - s_lastCleanupTimeByAddress[user]) >= s_CLEANUP_INTERVAL) {
                addressesReadyForCleanup[countaddressesReadyForCleanup] = user;
                countaddressesReadyForCleanup++;
            }

            if ((block.timestamp - s_lastInteractionTime[user]) >= s_INACTIVITY_THRESHOLD) {
                addressesReadyToBeRemoved[countAddressesToBeRemoved] = user;
                countAddressesToBeRemoved++;
            }
        }

        if (expiredTransfers.length > 0 || countaddressesReadyForCleanup > 0 || countAddressesToBeRemoved > 0) {
            upkeepNeeded = true;
            performData = abi.encode(
                refundNeeded,
                expiredTransfers,
                addressesReadyForCleanup,
                countaddressesReadyForCleanup,
                addressesReadyToBeRemoved,
                countAddressesToBeRemoved
            );
        } else {
            upkeepNeeded = false;
            performData = "";
        }
    }

    function performUpkeep(bytes calldata performData) external {
        (
            bool refundNeeded,
            uint256[] memory expiredTransfers,
            address[] memory addressesReadyForCleanup,
            uint256 countAddressesToBeCleaned,
            address[] memory addressesReadyToBeRemoved,
            uint256 countAddressesToBeRemoved
        ) = abi.decode(performData, (bool, uint256[], address[], uint256, address[], uint256));

        if (refundNeeded) {
            for (uint256 i = 0; i < expiredTransfers.length; i++) {
                refundExpiredTransfer(expiredTransfers[i]);
            }
        }

        if (countAddressesToBeCleaned > 0) {
            for (uint256 i = 0; i < countAddressesToBeCleaned; i++) {
                address user = addressesReadyForCleanup[i];

                removeAllCanceledTransfersByAddress(user);
                removeAllExpiredAndRefundedTransfersByAddress(user);
                removeAllClaimedTransfersByAddress(user);

                s_lastCleanupTimeByAddress[user] = block.timestamp;
            }
        }

        if (countAddressesToBeRemoved > 0) {
            for (uint256 i = 0; i < countAddressesToBeRemoved; i++) {
                address user = addressesReadyToBeRemoved[i];
                removeAddressFromTracking(user);
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL ONLYOWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function whitelistToken(address token) external onlyOwner {
        if (s_allowedTokens[token]) {
            revert PST__TokenAlreadyWhitelisted();
        }
        s_allowedTokens[token] = true;
        s_tokenList.push(token);
        s_feeBalances[token] = 0;

        emit TokenAddedToAllowList(token);
    }

    function removeWhitelistedToken(address token) external onlyOwner onlyValidToken(token) {
        s_feeBalances[token] = 0;
        s_allowedTokens[token] = false;
        for (uint256 i = 0; i < s_tokenList.length; i++) {
            if (token == s_tokenList[i]) {
                s_tokenList[i] = s_tokenList[s_tokenList.length - 1];
                s_tokenList.pop();
                break;
            }
        }

        emit TokenRemovedFromAllowList(token);
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

    function withdrawFeesForToken(address token, uint256 amount)
        external
        onlyOwner
        onlyValidToken(token)
        nonReentrant
        moreThanZero(amount)
    {
        if (amount < s_feeBalances[token]) {
            revert PST__InsufficientFeeBalance();
        }

        s_feeBalances[token] -= amount;

        emit SuccessfulFeeWithdrawal(token, amount);

        if (token == address(0)) {
            (bool success,) = msg.sender.call{value: amount}("");
            if (!success) {
                revert PST__FeeWIthdrawalFailed();
            }
        } else {
            IERC20 erc20 = IERC20(token);
            bool success = erc20.transfer(msg.sender, amount);
            if (!success) {
                revert PST__FeeWIthdrawalFailed();
            }
        }
    }

    function setNewMinPasswordLength(uint256 newMinPasswordLength)
        external
        onlyOwner
        moreThanZero(newMinPasswordLength)
    {
        if (newMinPasswordLength < REQ_MIN_PASSWORD_LENGTH) {
            revert PST__MinPasswordLengthIsSeven();
        }
        s_MIN_PASSWORD_LENGTH = newMinPasswordLength;
    }

    function setNewClaimCooldownPeriod(uint256 newClaimCooldownPeriod)
        external
        onlyOwner
        moreThanZero(newClaimCooldownPeriod)
    {
        if (newClaimCooldownPeriod < MIN_CLAIM_COOLDOWN_PERIOD) {
            revert PST__InvalidClaimCooldownPeriod({minRequired: MIN_CLAIM_COOLDOWN_PERIOD});
        }
        s_CLAIM_COOLDOWN_PERIOD = newClaimCooldownPeriod;
    }

    function setNewAvailabilityPeriod(uint256 newAvailabilityPeriod)
        external
        onlyOwner
        moreThanZero(newAvailabilityPeriod)
    {
        if (newAvailabilityPeriod < MIN_AVAILABILITY_PERIOD) {
            revert PST__InvalidAvailabilityPeriod({minRequired: MIN_AVAILABILITY_PERIOD});
        }
        s_AVAILABILITY_PERIOD = newAvailabilityPeriod;
    }

    function setNewCleanupInterval(uint256 newCleanupInterval) external onlyOwner moreThanZero(newCleanupInterval) {
        if (newCleanupInterval < MIN_CLEANUP_INTERVAL) {
            revert PST__InvalidCleanupInterval({minRequired: MIN_CLEANUP_INTERVAL});
        }
        s_CLEANUP_INTERVAL = newCleanupInterval;
    }

    function setNewInactivityThreshhold(uint256 newInactivityThreshhold)
        external
        onlyOwner
        moreThanZero(newInactivityThreshhold)
    {
        if (newInactivityThreshhold < MIN_INACTIVITY_THRESHOLD) {
            revert PST__InvalidInactivityThreshhold({minRequired: MIN_INACTIVITY_THRESHOLD});
        }
        s_INACTIVITY_THRESHOLD = newInactivityThreshhold;
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function removeAddressFromTracking(address user) internal {
        for (uint256 i = 0; i < s_addressList.length; i++) {
            if (s_addressList[i] == user) {
                s_addressList[i] = s_addressList[s_addressList.length - 1];
                s_addressList.pop();
                break;
            }
        }

        delete s_trackedAddresses[user];
        delete s_lastInteractionTime[user];
        delete s_lastCleanupTimeByAddress[user];
    }

    function addAddressToTracking(address user) internal {
        if (!s_trackedAddresses[user]) {
            s_trackedAddresses[user] = true;
            s_addressList.push(user);
            s_lastCleanupTimeByAddress[user] = block.timestamp;
        }
    }

    function checkPassword(uint256 transferId, string memory password) internal view returns (bool) {
        (bytes32 receiverPassword,) = encodePassword(password);
        bytes32 senderPassword = s_transfersById[transferId].encodedPassword;

        return senderPassword == receiverPassword;
    }

    function addFee(address token, uint256 _transferFeeCost) internal onlyValidToken(token) {
        s_feeBalances[token] += _transferFeeCost;
    }

    function encodePassword(string memory _password) internal view returns (bytes32, bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));
        bytes32 encodedPassword = keccak256(abi.encodePacked(_password, salt));

        return (encodedPassword, salt);
    }

    function refundExpiredTransfer(uint256 transferId) internal onlyValidTransferIds(transferId) {
        Transfer storage transferToRefund = s_transfersById[transferId];
        address sender = transferToRefund.sender;
        address receiver = transferToRefund.receiver;
        address tokenToRefund = transferToRefund.token;
        uint256 amountToRefund = transferToRefund.amount;

        if (amountToRefund == 0) {
            revert PST__NoAmountToRefund();
        }

        s_isExpiredAndRefunded[transferId] = true;
        s_isPending[transferId] = false;
        transferToRefund.amount = 0;
        s_expiredAndRefundedTransferIds.push(transferId);

        s_expiredAndRefundedTransfersByAddress[sender].push(transferId);
        s_expiredAndRefundedTransfersByAddress[receiver].push(transferId);
        removeFromPendingTransfers(transferId);
        removeFromPendingTransfersByAddress(sender, transferId);
        removeFromPendingTransfersByAddress(receiver, transferId);

        emit TransferExpiredAndRefunded(
            sender, receiver, transferId, tokenToRefund, amountToRefund, transferToRefund.expiringTime
        );

        if (tokenToRefund == address(0)) {
            (bool success,) = sender.call{value: amountToRefund}("");
            if (!success) {
                revert PST__RefundFailed();
            }
        } else {
            IERC20 erc20 = IERC20(tokenToRefund);
            bool success = erc20.transferFrom(address(this), sender, amountToRefund);
            if (!success) {
                revert PST__TransferFailed();
            }
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

    // Function to remove all expired and refunded transfers
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

        delete s_canceledTransfersByAddress[user];
    }

    function removeAllExpiredAndRefundedTransfersByAddress(address user) internal onlyValidAddress(user) {
        if (s_expiredAndRefundedTransfersByAddress[user].length == 0) {
            revert PST__NoExpiredTransfers();
        }

        delete s_expiredAndRefundedTransfersByAddress[user];
    }

    function removeAllClaimedTransfersByAddress(address user) internal onlyValidAddress(user) {
        if (s_claimedTransfersByAddress[user].length == 0) {
            revert PST__NoClaimedTransfers();
        }

        delete s_claimedTransfersByAddress[user];
    }

    /*//////////////////////////////////////////////////////////////
                        PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /*//////////////////////////////////////////////////////////////
                        VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    // Function that checks the ETH balance of the contract
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // Check if a token is allowed
    function isTokenAllowed(address token) external view returns (bool) {
        return s_allowedTokens[token];
    }

    // Function to get the list of all allowed tokens
    function getAllowedTokens() public view returns (address[] memory) {
        return s_tokenList;
    }

    // Function to get all accumulated fees for a token
    function getAccumulatedFees(address token) external view onlyValidToken(token) returns (uint256) {
        return s_feeBalances[token];
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

    // Function to check if a specific transfer is expired and refunded
    function isExpiredAndRefundedTransfer(uint256 transferId) public view returns (bool) {
        return s_isExpiredAndRefunded[transferId];
    }

    // Function to check if a specific transfer is claimed
    function isClaimed(uint256 transferId) public view returns (bool) {
        return s_isClaimed[transferId];
    }

    function getClaimCooldownStatus(uint256 transferId)
        external
        view
        returns (bool isCoolDownActive, uint256 timeRemaining)
    {
        uint256 lastAttempt = s_lastFailedClaimAttempt[transferId];
        if (lastAttempt + s_CLAIM_COOLDOWN_PERIOD >= block.timestamp) {
            return (true, (lastAttempt + s_CLAIM_COOLDOWN_PERIOD) - block.timestamp);
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

    // Function to get all expired and refunded transfers in the system
    function getExpiredAndRefundedTransfers() public view returns (uint256[] memory) {
        return s_expiredAndRefundedTransferIds;
    }

    // Function to get all claimed transfers in the system
    function getClaimedTransfers() public view returns (uint256[] memory) {
        return s_claimedTransferIds;
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
            address token,
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
            transfer.token,
            transfer.amount,
            transfer.creationTime,
            transfer.expiringTime,
            state
        );
    }
}

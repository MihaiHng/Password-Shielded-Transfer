// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import {TransferFeeLibrary} from "./libraries/TransferFeeLib.sol";

contract PST_Store {
    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/
    error PST__NeedsMoreThanZero();
    error PST__InvalidAddress();
    error PST__AmountToSendShouldBeHigher(uint256 minAmount);
    error PST__PasswordNotProvided();
    error PST__PasswordTooShort(uint256 minCharactersRequired);
    error PST__MinPasswordLengthIsSeven();
    error PST__TransferFailed();
    error PST__NoAmountToRefund();
    error PST__CantSendToOwnAddress();
    error PST__IncorrectPassword();
    error PST__OnlySenderCanCancel();
    error PST__InvalidFeeLevel();
    error PST__FeeWithdrawalFailed();
    error PST__RefundFailed();
    error PST__InvalidTransferId();
    error PST__TransferNotPending();
    error PST__InvalidReceiver();
    error PST__CannotClaimInCancelCooldown();
    error PST__CannotClaimYet();
    error PST__CooldownPeriodElapsed();
    error PST__InvalidClaimCooldownPeriod(uint256 minRequired);
    error PST__InvalidAvailabilityPeriod(uint256 minRequired);
    error PST__InvalidCleanupInterval(uint256 minRequired);
    error PST__InvalidInactivityThreshold(uint256 minRequired);
    error PST__InvalidBatchLimit(uint256 minRequired);
    error PST__NotEnoughFunds(uint256 required, uint256 provided);
    error PST__InvalidAmountSent(uint256 required, uint256 provided);
    error PST__NoPendingTransfers();
    error PST__TransferNotFound();
    error PST__TokenAlreadyWhitelisted();
    error PST__TokenNotAllowed();
    error PST__InsufficientFeeBalance();
    error PST__InvalidNewOwnerAddress();
    error PST__LimitLevelTwoMustBeGreaterThanLimitLevelOne();
    error PST__TransferIdNotFound();
    error PST__OnlyForwarderCanCallPerformUpkeep();
    error PST__TransferExpired();

    /*//////////////////////////////////////////////////////////////
                          STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address public s_forwarderAddress;

    uint256 internal constant REQ_MIN_PASSWORD_LENGTH = 7;
    uint256 internal constant MIN_CLAIM_COOLDOWN_PERIOD = 15 minutes;
    uint256 internal constant MIN_AVAILABILITY_PERIOD = 1 days;
    uint256 internal constant MIN_CLEANUP_INTERVAL = 1 weeks;
    uint256 internal constant MIN_INACTIVITY_THRESHOLD = 1 weeks;
    uint256 internal constant MIN_BATCH_LIMIT = 20;
    uint256 internal constant MIN_AMOUNT_TO_SEND = 1e14; // 1 ether / 1e4 => 0.0001 ether

    uint256 public s_minPasswordLength = REQ_MIN_PASSWORD_LENGTH;
    uint256 public s_cancelCooldownPeriod = 3 minutes; // 30 minutes;
    uint256 public s_availabilityPeriod = 5 minutes; // 7 days;
    uint256 public s_cleanupInterval = 12 weeks;
    uint256 public s_inactivityThreshold = 12 weeks;
    uint256 public s_batchLimit = 50;

    uint256 public s_transferCounter;
    uint256 public s_limitLevelOne = 10e18;
    uint256 public s_limitLevelTwo = 100e18;
    uint256 public s_feeScalingFactor = 1e7;

    uint256[] public s_pendingTransferIds;
    uint256[] public s_canceledTransferIds;
    uint256[] public s_expiredAndRefundedTransferIds;
    uint256[] public s_claimedTransferIds;
    address[] public s_addressList;
    address[] public s_tokenList;

    TransferFeeLibrary.TransferFee public transferFee;

    struct Transfer {
        address sender;
        address receiver;
        address token;
        uint256 amount;
        uint256 creationTime;
        uint256 expiringTime;
        bytes32 encodedPassword;
    }

    // Mapping to track the original amount for a transfer Id, before being processed and updated to "0" <- for UI history display
    mapping(uint256 transferId => uint256) public s_originalAmounts;

    // Mapping to track if a transfer is pending
    mapping(uint256 transferId => bool) public s_isPending;
    // Mapping to track if a transfer is canceled
    mapping(uint256 transferId => bool) public s_isCanceled;
    // Mapping to track if a transfer is expired
    mapping(uint256 transferId => bool) public s_isExpiredAndRefunded;
    // Mapping to track if a transfer is claimed
    mapping(uint256 transferId => bool) public s_isClaimed;

    // Mapping to track all the pending transfers for an address
    mapping(address user => uint256[] transferIds)
        internal s_pendingTransfersByAddress;
    // Mapping to track all canceled transfers for an address
    mapping(address user => uint256[] transferIds)
        internal s_canceledTransfersByAddress;
    // Mapping to track all expired and refunded transfers for an address
    mapping(address user => uint256[] transferIds)
        internal s_expiredAndRefundedTransfersByAddress;
    // Mapping to track all claimed transfers for an address
    mapping(address user => uint256[] transferIds)
        internal s_claimedTransfersByAddress;

    // Mapping to track the index for an address
    mapping(address => uint256) public s_addressIndex; // 1-based index to detect presence (0 = not present)
    // Mapping to track the index for a pending transfer Id for user
    mapping(address => mapping(uint256 => uint256))
        public s_pendingTransferIndexByAddress; // 1-based index to detect presence (0 = not present)
    // Mapping to track the index for a pending transfer Id
    mapping(uint256 => uint256) public s_pendingTransferIndex; // 1-based index to detect presence (0 = not present)

    // Mapping of transfer Id to Transfer info struct
    mapping(uint256 transferId => Transfer transfer) public s_transfersById;
    // Mapping of transfer Id to last failed claim attempt time
    mapping(uint256 transfrId => uint256 lastFailedClaimAttemptTime)
        public s_lastClaimAttempt;
    // Mapping to track active addresses
    mapping(address user => bool) public s_trackedAddresses;
    // Mapping to track an address to its last cleanup time
    mapping(address user => uint256 lastCleanupTime)
        public s_lastCleanupTimeByAddress;
    // Mapping to track an address to its last active time
    mapping(address user => uint256 lastActiveTime)
        public s_lastInteractionTime;

    // Mapping to track if a token address is whitelisted
    mapping(address token => bool isAllowed) public s_allowedTokens;
    // Mapping to track the accumulated fees for each token allowed in whitelist
    mapping(address token => uint256 feeBalance) public s_feeBalances;

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
    // Event to log when the last interaction time changes for an address
    event LastInteractionTimeUpdated(
        address indexed user,
        uint256 indexed lastInteractionTime
    );
    // Event to log a canceled transfer
    event TransferCanceled(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount
    );
    // Event to log a completed transfer
    event TransferCompleted(
        address indexed sender,
        address indexed receiver,
        uint256 indexed transferIndex,
        address token,
        uint256 amount
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
    event SuccessfulFeeWithdrawal(
        address indexed token,
        uint256 indexed amount
    );

    // Event to log a token being whitelisted
    event TokenAddedToAllowList(address indexed token);

    // Event to log a token being removed from whitelist
    event TokenRemovedFromAllowList(address indexed token);

    // Event to track fee changes by level
    event TransferFeeChanged(uint8 level, uint256 newTransferFee);

    // Event to track when the minimum password length is changed
    event MinPasswordLengthChanged(uint256 newMinPasswordLength);

    // Event to log when the claim cooldown period changes
    event ClaimCooldownPeriodChanged(uint256 newClaimCooldownPeriod);

    // Event to log when the transfer availability period changes
    event AvailabilityPeriodChanged(uint256 newAvailabilityPeriod);

    // Event to log when the cleanup interval for addresses changed
    event CleanupIntervalChanged(uint256 newCleanupInterval);

    // Event to log when the inactivity threshhold for addresses changed
    event InactivityThresholdChanged(uint256 newInactivityThreshold);

    // Event to log when the batch limit changed
    event BatchLimitChanged(uint256 newBatchLimit);

    // Event to log the update of limit level one
    event LimitLevelOneChanged(uint256 newLimitLevelOne);

    // Event to log the update of limit level two
    event LimitLevelTwoChanged(uint256 newLimitLevelTwo);

    // Event to log the update of fee scaling factor
    event FeeScalingFactorChanged(uint256 newFeeScalingFactor);

    // Event to log the time when Canceled Transfers were removed from tracking
    event CanceledTransfersHistoryCleared();

    // Event to log the time when Expired and Refunded Transfers were removed from tracking
    event ExpiredAndRefundedTransfersHistoryCleared();

    // Event to log the time when Claimed Transfers were removed from tracking
    event ClaimedTransfersHistoryCleared();

    // Event to log Canceled Transfers for an Address were removed from tracking
    event CanceledTransfersForAddressHistoryCleared(address user);

    // Event to log Expired and Refunded Transfers for an Address were removed from tracking
    event ExpiredAndRefundedTransfersForAddressHistoryCleared(address user);

    // Event to log Claimed Transfers for an Address were removed from tracking
    event ClaimedTransfersForAddressHistoryCleared(address user);

    // Event to log an address being added to tracking
    event AddressAddedToTracking(address user);

    // Event to log an address being removed from tracking
    event AddressRemovedFromTracking(address user);
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {TransferFeeLibrary} from "./libraries/TransferFeeLib.sol";
import {PreApprovedTokensLibrary} from "./libraries/PreApprovedTokensLib.sol";

/**
 * @title PST Password Shielded Transfer
 * @author Mihai Hanga
 *
 * @dev This smart contract is the core of the Password Shielded Transfer(PST)
 * The main functionality of this system is the use of passwords to increase the security of transfers between accounts
 * The system uses a pull-based mechanism, where the receiver needs to claim a transfer
 * The receiver can only claim the transfer if they submit the correct passoword
 *
 * @notice The PST gives a few additional abilities to a regular transfer:
 * - A created transfer can be canceled, as long as claim cooldown period didn't elapse
 * - A created transfer has an expiry time, which if reached the transfer creator gets refunded
 * - Transfer history gets removed automatically and periodically
 * - Inactive users get removed automatically and periodically
 *
 * @notice The system will charge a fee per transfer. The fee is calculated as a percentage.
 * The fee is determined based on the amount transfered. There will be 3 fee levels, for example:
 *   -> 0.01% (1000/10e7) for transfers <= 10 ETH
 *   -> 0.001% (100/10e7) for 10 ETH < transfers <= 100 ETH
 *   -> 0.0001% (10/10e7) for transfers > 100 ETH
 *
 */
contract PST is Ownable, ReentrancyGuard, AutomationCompatibleInterface {
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
    error PST__CooldownPeriodNotElapsed();
    error PST__InvalidClaimCooldownPeriod(uint256 minRequired);
    error PST__InvalidAvailabilityPeriod(uint256 minRequired);
    error PST__InvalidCleanupInterval(uint256 minRequired);
    error PST__InvalidInactivityThreshold(uint256 minRequired);
    error PST__InvalidBatchLimit(uint256 minRequired);
    error PST__NotEnoughFunds(uint256 required, uint256 provided);
    error PST__InvalidAmountSent(uint256 required, uint256 provided);
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
    error PST__InvalidNewOwnerAddress();
    error PST__LimitLevelTwoMustBeGreaterThanLimitLevelOne();
    error PST__TransferIdNotFound();

    /*//////////////////////////////////////////////////////////////
                          TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/
    using TransferFeeLibrary for TransferFeeLibrary.TransferFee;

    /*//////////////////////////////////////////////////////////////
                          STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address private immutable i_automationRegistry;

    uint256 private constant REQ_MIN_PASSWORD_LENGTH = 7;
    uint256 private constant MIN_CLAIM_COOLDOWN_PERIOD = 15 minutes;
    uint256 private constant MIN_AVAILABILITY_PERIOD = 1 days;
    uint256 private constant MIN_CLEANUP_INTERVAL = 1 weeks;
    uint256 private constant MIN_INACTIVITY_THRESHOLD = 1 weeks;
    uint256 private constant MIN_BATCH_LIMIT = 20;
    uint256 private constant MIN_AMOUNT_TO_SEND = 1e14; // 1 ether / 1e4 => 0.0001 ether

    uint256 public s_minPasswordLength = REQ_MIN_PASSWORD_LENGTH;
    uint256 public s_claimCooldownPeriod = 30 minutes;
    uint256 public s_availabilityPeriod = 7 days;
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
        private s_pendingTransfersByAddress;
    // Mapping to track all canceled transfers for an address
    mapping(address user => uint256[] transferIds)
        private s_canceledTransfersByAddress;
    // Mapping to track all expired and refunded transfers for an address
    mapping(address user => uint256[] transferIds)
        private s_expiredAndRefundedTransfersByAddress;
    // Mapping to track all claimed transfers for an address
    mapping(address user => uint256[] transferIds)
        private s_claimedTransfersByAddress;

    // Mapping of transfer Id to Transfer info struct
    mapping(uint256 transferId => Transfer transfer) public s_transfersById;
    // Mapping of transfer Id to last failed claim attempt time
    mapping(uint256 transfrId => uint256 lastFailedClaimAttemptTime)
        public s_lastFailedClaimAttempt;
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
        if (transferId >= s_transferCounter) {
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

    modifier onlyValidToken(address token) {
        if (!s_allowedTokens[token]) {
            revert PST__TokenNotAllowed();
        }
        _;
    }

    modifier claimCooldownElapsed(uint256 transferId) {
        uint256 lastAttempt = s_lastFailedClaimAttempt[transferId];
        if (block.timestamp < lastAttempt + s_claimCooldownPeriod) {
            revert PST__CooldownPeriodNotElapsed();
        }
        _;
    }

    modifier onlyKeepers() {
        require(
            msg.sender == i_automationRegistry,
            "Only Keepers can call this function"
        );
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @param _automationRegistry = 0x6593c7De001fC8542bB1703532EE1E5aA0D458fD -> for Ethereum;
     *                              0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad -> for Sepolia;
     */
    constructor(
        uint256 _transferFeeLvlOne,
        uint256 _transferFeeLvlTwo,
        uint256 _transferFeeLvlThree,
        address _automationRegistry
    ) Ownable(msg.sender) {
        if (address(_automationRegistry) == address(0)) {
            revert PST__InvalidAddress();
        }
        i_automationRegistry = _automationRegistry;

        transferFee = TransferFeeLibrary.TransferFee({
            lvlOne: _transferFeeLvlOne,
            lvlTwo: _transferFeeLvlTwo,
            lvlThree: _transferFeeLvlThree
        });

        /**
         * @dev Initializing an ERC20 list of preapproved tokens
         */
        address[] memory tokens = PreApprovedTokensLibrary
            .getPreApprovedTokens();

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            s_allowedTokens[token] = true;
            s_feeBalances[token] = 0;
            s_tokenList.push(token);
        }
    }

    receive() external payable {}

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @param receiver: The address that will claim the transfer
     * @param token: The token transfered to receiver
     * @param amount: The amount of token transfered to receiver
     * @param password: The password which will be used by receiver to claim the transfer
     * @notice This function will create transfer Ids in the system which will have a "pending" status
     */
    function createTransfer(
        address receiver,
        address token,
        uint256 amount,
        string memory password
    )
        external
        payable
        nonReentrant
        onlyValidAddress(receiver)
        moreThanZero(amount)
        onlyValidToken(token)
    {
        if (receiver == msg.sender) {
            revert PST__CantSendToOwnAddress();
        }

        if (amount < MIN_AMOUNT_TO_SEND) {
            revert PST__AmountToSendShouldBeHigher({
                minAmount: MIN_AMOUNT_TO_SEND
            });
        }

        if (bytes(password).length == 0) {
            revert PST__PasswordNotProvided();
        }

        if (bytes(password).length < s_minPasswordLength) {
            revert PST__PasswordTooShort({
                minCharactersRequired: s_minPasswordLength
            });
        }

        uint256 transferId = s_transferCounter++;

        TransferFeeLibrary.TransferFee memory currentFee = transferFee;

        (
            uint256 totalTransferCost,
            uint256 transferFeeCost
        ) = TransferFeeLibrary.calculateTotalTransferCost(
                amount,
                s_limitLevelOne,
                s_limitLevelTwo,
                s_feeScalingFactor,
                currentFee
            );

        s_transfersById[transferId].sender = msg.sender;
        s_transfersById[transferId].receiver = receiver;

        bytes32 encodedPassword = encodePassword(transferId, password);

        s_transfersById[transferId] = Transfer({
            sender: msg.sender,
            receiver: receiver,
            token: token,
            amount: amount,
            creationTime: block.timestamp,
            expiringTime: block.timestamp + s_availabilityPeriod,
            encodedPassword: encodedPassword
        });

        s_isPending[transferId] = true;
        s_pendingTransferIds.push(transferId);
        s_pendingTransfersByAddress[msg.sender].push(transferId);
        s_pendingTransfersByAddress[receiver].push(transferId);

        addFee(token, transferFeeCost);
        addAddressToTracking(msg.sender);
        s_lastInteractionTime[msg.sender] = block.timestamp;

        emit TransferInitiated(
            msg.sender,
            receiver,
            transferId,
            token,
            amount,
            transferFeeCost
        );
        emit LastInteractionTimeUpdated(msg.sender, block.timestamp);

        if (token == address(0)) {
            if (msg.value != totalTransferCost) {
                revert PST__InvalidAmountSent({
                    required: totalTransferCost,
                    provided: msg.value
                });
            }
        } else {
            IERC20 erc20 = IERC20(token);
            if (erc20.balanceOf(msg.sender) < totalTransferCost) {
                revert PST__NotEnoughFunds({
                    required: totalTransferCost,
                    provided: erc20.balanceOf(msg.sender)
                });
            }

            bool success = erc20.transferFrom(
                msg.sender,
                address(this),
                totalTransferCost
            );
            if (!success) {
                revert PST__TransferFailed();
            }
        }
    }

    /**
     * @param transferId: The Id of the transfer that will be canceled
     * @notice This function will cancel a transferId, only if the transferId has the "pending" status, meaning:
     * - claimCooldownPeriod didn't elapse
     * - transferId wasn't claimed already
     * - transferId didn't expire already
     * @notice The new status of transferId will be "canceled"
     */
    function cancelTransfer(
        uint256 transferId
    )
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

        emit TransferCanceled(
            msg.sender,
            receiver,
            transferId,
            tokenToCancel,
            amountToCancel
        );
        emit LastInteractionTimeUpdated(msg.sender, block.timestamp);

        if (tokenToCancel == address(0)) {
            (bool success, ) = msg.sender.call{value: amountToCancel}("");
            if (!success) {
                revert PST__TransferFailed();
            }
        } else {
            IERC20 erc20 = IERC20(tokenToCancel);
            bool success = erc20.transfer(msg.sender, amountToCancel);
            if (!success) {
                revert PST__TransferFailed();
            }
        }
    }

    /**
     * @param transferId: The Id of the transfer that will be claimed
     * @param password: The password has to match the password set by sender when transfer was created via createTransfer
     * @notice The receiver(i.e., the calling address) will receive the amount of token sent by sender when createTransfer was called
     * @notice The new status of transferId will be "claimed"
     */
    function claimTransfer(
        uint256 transferId,
        string memory password
    )
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

        if (bytes(password).length < s_minPasswordLength) {
            revert PST__PasswordTooShort({
                minCharactersRequired: s_minPasswordLength
            });
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

        emit TransferCompleted(
            sender,
            msg.sender,
            transferId,
            tokenToClaim,
            amountToClaim
        );
        emit LastInteractionTimeUpdated(msg.sender, block.timestamp);

        if (tokenToClaim == address(0)) {
            (bool success, ) = msg.sender.call{value: amountToClaim}("");
            if (!success) {
                revert PST__TransferFailed();
            }
        } else {
            IERC20 erc20 = IERC20(tokenToClaim);
            bool success = erc20.transfer(msg.sender, amountToClaim);
            if (!success) {
                revert PST__TransferFailed();
            }
        }
    }

    /**
     * @notice This function will call 2 other functions, _clearHistory() and _removeInactiveAddresses(),
     * in order to perform a general data cleanup
     * @dev This function will be automated with Chainlink Automation -> Time-based triggered at set intervals(e.g., every 90 days)
     */
    function performMaintenance() external {
        _clearHistory();
        _removeInactiveAddresses();
    }

    /**
     * @notice This function automatically refunds expired transferIds
     * @dev This function will be automated with Chainlink Automation -> Custom Logic Triggered
     * @dev This is the function that the Chainlink Automation nodes call
     * @dev They look for `upkeepNeeded` to return True.
     * @dev The following should be true for this to return true:
     * 1. Expired transferIds exist, expiredCount > 0.
     * 2. Implicitly, the subscription is funded with LINK.
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 batchLimit = s_batchLimit;
        uint256[] memory expiredTransfers = getExpiredTransfers();
        uint256 expiredCount = expiredTransfers.length;

        if (expiredCount == 0) {
            upkeepNeeded = false;
            performData = "";
            return (upkeepNeeded, performData);
        }

        if (expiredCount > 0) {
            upkeepNeeded = true;

            uint256[] memory batchExpiredTransfers = new uint256[](batchLimit);
            uint256 batchExpiredCount = expiredCount > batchLimit
                ? batchLimit
                : expiredCount;

            if (expiredCount > 0) {
                for (uint256 i = 0; i < batchExpiredCount; i++) {
                    batchExpiredTransfers[i] = expiredTransfers[i];
                }

                performData = abi.encode(
                    batchExpiredTransfers,
                    batchExpiredCount
                );
            }
        } else {
            upkeepNeeded = false;
            performData = "";
        }
    }

    /**
     * @dev This function will be called every time "checkUpkeep" returns true
     * @dev This function will refund expired transfers in batches(ccurrently up to 50 transfer IDs)
     */
    function performUpkeep(
        bytes calldata performData
    ) external override onlyKeepers {
        (
            uint256[] memory batchExpiredTransfers,
            uint256 batchExpiredCount
        ) = abi.decode(performData, (uint256[], uint256));

        for (uint256 i = 0; i < batchExpiredCount; i++) {
            refundExpiredTransfer(batchExpiredTransfers[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL ONLYOWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @param newOwner: address of the new assigned owner
     * @notice This function allows only the owner to assign the "owner" role to a new address
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) {
            revert PST__InvalidNewOwnerAddress();
        }
        super.transferOwnership(newOwner);
    }

    /**
     * @dev This function is intended for tests
     * @dev This function is a wrapper for _addTokenToAllowList(token) with external visibility
     * @param token: Address of an ERC20 token
     * @notice This function allows only the owner to add a new token to the allow list
     */
    function addTokenToAllowList(address token) external onlyOwner {
        _addTokenToAllowList(token);
    }

    /**
     * @dev This function is intended for tests
     * @dev This function is a wrapper for _removeTokenFromAllowList(token) with external visibility
     * @param token: Address of an ERC20 token
     * @notice This function allows only the owner to remove a token from the allow list
     */
    function removeTokenFromAllowList(address token) external onlyOwner {
        _removeTokenFromAllowList(token);
    }

    /**
     * @dev This function is intended for tests
     * @dev This function is a wrapper for _clearHistory() with external visibility
     * @notice This function allows only the owner to remove old transferId info
     */
    function clearHistory() external onlyOwner {
        _clearHistory();
    }

    /**
     * @dev This function is intended for tests
     * @dev This function is a wrapper for _removeInactiveAddresses() with external visibility
     * @notice This function allows only the owner to remove inactive addresses
     */
    function removeInactiveAddresses() external onlyOwner {
        _removeInactiveAddresses();
    }

    /**
     * @param level: Selects a fee level. There are three fee levels: 1, 2, 3.
     * @param newTransferFee: Value for the new transfer fee
     * @notice This function allows only the owner to set a new transfer fee value for a fee level
     */
    function setTransferFee(
        uint8 level,
        uint256 newTransferFee
    ) external onlyOwner moreThanZero(newTransferFee) {
        if (level == 1) {
            transferFee.lvlOne = newTransferFee;
        } else if (level == 2) {
            transferFee.lvlTwo = newTransferFee;
        } else if (level == 3) {
            transferFee.lvlThree = newTransferFee;
        } else {
            revert PST__InvalidFeeLevel();
        }

        emit TransferFeeChanged(level, newTransferFee);
    }

    /**
     * @param newLimitLevelOne: Value for new limit level 1, for example 10e18 / 10 ethereum.
     * @notice This function allows only the owner to set a new limit value for fee level 1
     */
    function setNewLimitLevelOne(
        uint256 newLimitLevelOne
    ) external onlyOwner moreThanZero(newLimitLevelOne) {
        s_limitLevelOne = newLimitLevelOne;

        emit LimitLevelOneChanged(newLimitLevelOne);
    }

    /**
     * @param newLimitLevelTwo: Value for new limit level 2, for example 300e18 / 300 ethereum.
     * @notice This function allows only the owner to set a new limit value for fee level 2
     */
    function setNewLimitLevelTwo(
        uint256 newLimitLevelTwo
    ) external onlyOwner moreThanZero(newLimitLevelTwo) {
        if (newLimitLevelTwo <= s_limitLevelOne) {
            revert PST__LimitLevelTwoMustBeGreaterThanLimitLevelOne();
        }

        s_limitLevelTwo = newLimitLevelTwo;

        emit LimitLevelTwoChanged(newLimitLevelTwo);
    }

    /**
     * @param newFeeScalingFactor: Value for new scaling factor(ex. 1e6 or 1e8)
     * @notice This function allows only the owner to assign a new value to the fee scaling factor
     */
    function setNewFeeScalingFactor(
        uint256 newFeeScalingFactor
    ) external onlyOwner moreThanZero(newFeeScalingFactor) {
        s_feeScalingFactor = newFeeScalingFactor;

        emit FeeScalingFactorChanged(newFeeScalingFactor);
    }

    /**
     * @param token: Token fee to withdraw
     * @param amount: Amount of fee to withdraw
     * @notice This function allows only the owner to withdraw a specified amount of accumulated token fees
     */
    function withdrawFeesForToken(
        address token,
        uint256 amount
    )
        external
        onlyOwner
        onlyValidToken(token)
        moreThanZero(amount)
        nonReentrant
    {
        if (amount > s_feeBalances[token]) {
            revert PST__InsufficientFeeBalance();
        }

        s_feeBalances[token] -= amount;

        emit SuccessfulFeeWithdrawal(token, amount);

        if (token == address(0)) {
            (bool success, ) = msg.sender.call{value: amount}("");
            if (!success) {
                revert PST__FeeWithdrawalFailed();
            }
        } else {
            IERC20 erc20 = IERC20(token);
            bool success = erc20.transfer(msg.sender, amount);
            if (!success) {
                revert PST__FeeWithdrawalFailed();
            }
        }
    }

    /**
     * @param newMinPasswordLength: Value for new minimum password length
     * @notice This function allows only the owner to set a new minimum password length
     */
    function setNewMinPasswordLength(
        uint256 newMinPasswordLength
    ) external onlyOwner moreThanZero(newMinPasswordLength) {
        if (newMinPasswordLength < REQ_MIN_PASSWORD_LENGTH) {
            revert PST__MinPasswordLengthIsSeven();
        }

        s_minPasswordLength = newMinPasswordLength;

        emit MinPasswordLengthChanged(newMinPasswordLength);
    }

    /**
     * @param newClaimCooldownPeriod: Value for new claim cooldown period
     * @notice This function allows only the owner to configure a new claim cooldown period
     */
    function setNewClaimCooldownPeriod(
        uint256 newClaimCooldownPeriod
    ) external onlyOwner moreThanZero(newClaimCooldownPeriod) {
        if (newClaimCooldownPeriod < MIN_CLAIM_COOLDOWN_PERIOD) {
            revert PST__InvalidClaimCooldownPeriod({
                minRequired: MIN_CLAIM_COOLDOWN_PERIOD
            });
        }

        s_claimCooldownPeriod = newClaimCooldownPeriod;

        emit ClaimCooldownPeriodChanged(newClaimCooldownPeriod);
    }

    /**
     * @param newAvailabilityPeriod: Value for new transfer availability period
     * @notice This function allows only the owner to set a new period during which a transfer remains available
     */
    function setNewAvailabilityPeriod(
        uint256 newAvailabilityPeriod
    ) external onlyOwner moreThanZero(newAvailabilityPeriod) {
        if (newAvailabilityPeriod < MIN_AVAILABILITY_PERIOD) {
            revert PST__InvalidAvailabilityPeriod({
                minRequired: MIN_AVAILABILITY_PERIOD
            });
        }

        s_availabilityPeriod = newAvailabilityPeriod;

        emit AvailabilityPeriodChanged(newAvailabilityPeriod);
    }

    /**
     * @param newCleanupInterval: Value for new cleanup interval
     * @notice This function allows only the owner to set a new cleanup interval
     */
    function setNewCleanupInterval(
        uint256 newCleanupInterval
    ) external onlyOwner moreThanZero(newCleanupInterval) {
        if (newCleanupInterval < MIN_CLEANUP_INTERVAL) {
            revert PST__InvalidCleanupInterval({
                minRequired: MIN_CLEANUP_INTERVAL
            });
        }

        s_cleanupInterval = newCleanupInterval;

        emit CleanupIntervalChanged(newCleanupInterval);
    }

    /**
     * @param newInactivityThreshold: Value for new inactivity threshold
     * @notice This function allows only the owner to set a new inactivity threshold
     */
    function setNewInactivityThreshold(
        uint256 newInactivityThreshold
    ) external onlyOwner moreThanZero(newInactivityThreshold) {
        if (newInactivityThreshold < MIN_INACTIVITY_THRESHOLD) {
            revert PST__InvalidInactivityThreshold({
                minRequired: MIN_INACTIVITY_THRESHOLD
            });
        }

        s_inactivityThreshold = newInactivityThreshold;

        emit InactivityThresholdChanged(newInactivityThreshold);
    }

    /**
     * @param newBatchLimit: Value for new batch limit
     * @notice This function allows only the owner to set a new batch limit
     */
    function setNewBatchLimit(uint256 newBatchLimit) external onlyOwner {
        if (newBatchLimit < MIN_BATCH_LIMIT) {
            revert PST__InvalidBatchLimit({minRequired: MIN_BATCH_LIMIT});
        }

        s_batchLimit = newBatchLimit;

        emit BatchLimitChanged(newBatchLimit);
    }

    /*//////////////////////////////////////////////////////////////
                        PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @dev Function called by "performUpkeep" through Chainlink Automation to refund expired transfers
     * @param transferId: Id of transfer to refund
     * @notice This function will refund an expired transfer
     */
    function refundExpiredTransfer(
        uint256 transferId
    ) public onlyValidTransferIds(transferId) {
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
            sender,
            receiver,
            transferId,
            tokenToRefund,
            amountToRefund,
            transferToRefund.expiringTime
        );

        if (tokenToRefund == address(0)) {
            (bool success, ) = sender.call{value: amountToRefund}("");
            if (!success) {
                revert PST__RefundFailed();
            }
        } else {
            IERC20 erc20 = IERC20(tokenToRefund);
            bool success = erc20.transfer(sender, amountToRefund);
            if (!success) {
                revert PST__TransferFailed();
            }
        }
    }

    /**
     * @param user: Address to be added to the tracking array "addressList"
     * @notice This function will add an address to "addressList"
     */
    function addAddressToTracking(address user) public {
        if (!s_trackedAddresses[user]) {
            s_trackedAddresses[user] = true;
            s_addressList.push(user);
            s_lastCleanupTimeByAddress[user] = block.timestamp;
        }
    }

    /**
     * @param user: Address to be removed from tracking array "addressList"
     * @notice This function will remove an address from "addressList"
     */
    function removeAddressFromTracking(address user) public {
        bool userFound;

        for (uint256 i = 0; i < s_addressList.length; i++) {
            if (s_addressList[i] == user) {
                s_addressList[i] = s_addressList[s_addressList.length - 1];
                s_addressList.pop();
                userFound = true;
                break;
            }
        }

        if (userFound) {
            delete s_trackedAddresses[user];
            delete s_lastInteractionTime[user];
            delete s_lastCleanupTimeByAddress[user];
        }
    }

    /**
     * @param token: Token address that is having its fee balance updated
     * @param _transferFeeCost: Fee to add to the token’s balance
     * @notice This function will update the token fee balance with transfer fee cost
     * @notice This function is called when a transferId is created via "createTransfer"
     */
    function addFee(
        address token,
        uint256 _transferFeeCost
    ) public onlyValidToken(token) {
        s_feeBalances[token] += _transferFeeCost;
    }

    /**
     * @param transferId: Transfer Id whose password it's being encoded
     * @param _password: The password provided by sender during "createTransfer"
     * @notice This function will encode a password using a salt, via "keccak256()"
     */
    function encodePassword(
        uint256 transferId,
        string memory _password
    ) public view returns (bytes32) {
        address sender = s_transfersById[transferId].sender;
        address receiver = s_transfersById[transferId].receiver;
        bytes32 salt = keccak256(
            abi.encodePacked(transferId, sender, receiver)
        );
        bytes32 encodedPassword = keccak256(abi.encodePacked(_password, salt));

        return (encodedPassword);
    }

    /**
     * @param transferId: ID of the transfer to check
     * @param password: Password to verify against the stored hash
     * @notice This function will check if the claim password matches the sender's password
     * @notice This function is called when a transferId is claimed via "claimTransfer"
     */
    function checkPassword(
        uint256 transferId,
        string memory password
    ) public view returns (bool) {
        bytes32 receiverPassword = encodePassword(transferId, password);
        bytes32 senderPassword = s_transfersById[transferId].encodedPassword;

        return senderPassword == receiverPassword;
    }

    /**
     * @param amount: Amount used to calculate totalTransferCost and transferFeeCost
     * @notice This function will calculate and return totalTransferCost and transferFeeCost
     */
    function calculateTotalTransferCostPublic(
        uint256 amount
    ) public view returns (uint256 totalTransferCost, uint256 transferFeeCost) {
        return
            TransferFeeLibrary.calculateTotalTransferCost(
                amount,
                s_limitLevelOne,
                s_limitLevelTwo,
                s_feeScalingFactor,
                transferFee
            );
    }

    /**
     * @param transferId: ID of the pending transfer to remove
     * @notice This function will remove transfer id with status "pending" from s_pendingTransfers array
     */
    function removeFromPendingTransfers(uint256 transferId) public {
        uint256 length = s_pendingTransferIds.length;
        bool idFound;

        if (length == 0) {
            revert PST__NoPendingTransfers();
        }

        for (uint256 i = 0; i < length; i++) {
            if (s_pendingTransferIds[i] == transferId) {
                s_pendingTransferIds[i] = s_pendingTransferIds[length - 1];
                s_pendingTransferIds.pop();
                idFound = true;
                break;
            }
        }

        if (!idFound) {
            revert PST__TransferIdNotFound();
        }
    }

    /**
     * @param user: Address associated with the transfer
     * @param transferId: ID of the pending transfer to remove
     * @notice This function will remove for user, a transfer ID with status "pending" from "s_pendingTransfersByAddress array"
     */
    function removeFromPendingTransfersByAddress(
        address user,
        uint256 transferId
    ) public {
        uint256 length = s_pendingTransfersByAddress[user].length;
        if (length == 0) {
            revert PST__NoPendingTransfers();
        }

        for (uint256 i = 0; i < length; i++) {
            if (s_pendingTransfersByAddress[user][i] == transferId) {
                s_pendingTransfersByAddress[user][
                    i
                ] = s_pendingTransfersByAddress[user][length - 1];
                s_pendingTransfersByAddress[user].pop();
                break;
            }
        }
    }

    /**
     * @notice Removes all canceled transfer IDs from storage
     * @notice Iterates over global list and removes canceled transfer IDs
     * @notice This function can only be called by the owner
     */
    function removeAllCanceledTransfers() public onlyOwner {
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

        emit CanceledTransfersHistoryCleared();
    }

    /**
     * @notice Removes all expired and refunded transfer IDs from storage
     * @notice Iterates over global list and removes expired and refunded transfer IDs
     * @notice This function can only be called by the owner
     */
    function removeAllExpiredAndRefundedTransfers() public onlyOwner {
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

        emit ExpiredAndRefundedTransfersHistoryCleared();
    }

    /**
     * @notice Removes all claimed transfer IDs from storage
     * @notice Iterates over global list and removes claimed transfer IDs
     * @notice This function can only be called by the owner
     */
    function removeAllClaimedTransfers() public onlyOwner {
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

        emit ClaimedTransfersHistoryCleared();
    }

    /**
     * @param user: User address whose canceled transfers will be removed
     * @notice This function will remove all canceled transfer IDs for a given address
     */
    function removeAllCanceledTransfersByAddress(
        address user
    ) public onlyValidAddress(user) {
        delete s_canceledTransfersByAddress[user];

        emit CanceledTransfersForAddressHistoryCleared(user);
    }

    /**
     * @param user: User address whose expired and refunded transfers will be removed
     * @notice This function will remove all expired and refunded transfer IDs for a given address
     */
    function removeAllExpiredAndRefundedTransfersByAddress(
        address user
    ) public onlyValidAddress(user) {
        delete s_expiredAndRefundedTransfersByAddress[user];

        emit ExpiredAndRefundedTransfersForAddressHistoryCleared(user);
    }

    /**
     * @param user: User address whose claimed transfers will be removed
     * @notice This function will remove all claimed transfer IDs for a given address
     */
    function removeAllClaimedTransfersByAddress(
        address user
    ) public onlyValidAddress(user) {
        delete s_claimedTransfersByAddress[user];

        emit ClaimedTransfersForAddressHistoryCleared(user);
    }

    /*//////////////////////////////////////////////////////////////
                        PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @param token: Address of ERC20 token that will be added to allow list "s_allowedTokens"
     * @notice This function will add token to allow list "s_allowedTokens"
     * @notice This function has an external onlyOwner version for testing purposes - addTokenToAllowList
     */
    function _addTokenToAllowList(address token) internal {
        if (s_allowedTokens[token]) {
            revert PST__TokenAlreadyWhitelisted();
        }
        s_allowedTokens[token] = true;
        s_tokenList.push(token);
        s_feeBalances[token] = 0;

        emit TokenAddedToAllowList(token);
    }

    /**
     * @param token: Address of ERC20 token that will be removed from allow list "s_allowedTokens"
     * @notice This function will remove token from allow list "s_allowedTokens"
     * @notice This function has an external onlyOwner version for testing purposes - removeTokenFromAllowList
     */
    function _removeTokenFromAllowList(address token) internal {
        uint256 length = s_tokenList.length;
        s_allowedTokens[token] = false;
        for (uint256 i = 0; i < length; i++) {
            if (token == s_tokenList[i]) {
                s_tokenList[i] = s_tokenList[length - 1];
                s_tokenList.pop();
                break;
            }
        }

        emit TokenRemovedFromAllowList(token);
    }

    /**
     * @notice This function removes in batches of maximum 50, all canceled, expired-refunded, claimed transfer IDs
     * @notice Only removes for users whose last cleanup was more than "s_cleanupInterval" ago
     * @notice This function is performed automatically, being called by "performMaintainance()" which is called periodically
     * by Chainlink Automation nodes
     */
    function _clearHistory() private {
        uint256 batchLimit = s_batchLimit;
        address[] memory addressList = s_addressList;
        uint256 countCleanedAddresses;

        for (
            uint256 i = 0;
            i < addressList.length && countCleanedAddresses < batchLimit / 2;
            i++
        ) {
            address user = addressList[i];

            if (
                (block.timestamp - s_lastCleanupTimeByAddress[user]) >=
                s_cleanupInterval
            ) {
                removeAllCanceledTransfersByAddress(user);
                removeAllExpiredAndRefundedTransfersByAddress(user);
                removeAllClaimedTransfersByAddress(user);

                countCleanedAddresses++;
                s_lastCleanupTimeByAddress[user] = block.timestamp;
            }
        }

        if (countCleanedAddresses < batchLimit / 2) {
            s_batchLimit = batchLimit - countCleanedAddresses;
        } else {
            s_batchLimit = batchLimit / 2;
        }
    }

    /**
     * @notice This function removes in batches of maximum 50, all inactive addresses
     * @notice Inactive meaning no operation in the last "s_inactivityThreshold" days
     * @notice This function is performed automatically, being called by "performMaintainance()"
     * which is called periodically by Chainlink Automation nodes
     */
    function _removeInactiveAddresses() private {
        uint256 batchLimit = s_batchLimit;
        address[] memory addressList = s_addressList;
        uint256 countRemovedAddresses;

        for (
            uint256 i = 0;
            i < addressList.length && countRemovedAddresses < batchLimit;
            i++
        ) {
            address user = addressList[i];

            if (
                (block.timestamp - s_lastInteractionTime[user]) >=
                s_inactivityThreshold
            ) {
                removeAddressFromTracking(user);
                countRemovedAddresses++;
            }
        }

        if (countRemovedAddresses < batchLimit / 2) {
            s_batchLimit = batchLimit - countRemovedAddresses;
        } else {
            s_batchLimit = batchLimit / 2;
        }
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    // CHECKER FUNCTIONS //

    // Function to check if a token is allowed
    function isTokenAllowed(address token) public view returns (bool) {
        return s_allowedTokens[token];
    }

    // Function to check if an address is in tracking
    function isAddressInTracking(address user) public view returns (bool) {
        return s_trackedAddresses[user];
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
    function isExpiredAndRefundedTransfer(
        uint256 transferId
    ) public view returns (bool) {
        return s_isExpiredAndRefunded[transferId];
    }

    // Function to check if a specific transfer is claimed
    function isClaimed(uint256 transferId) public view returns (bool) {
        return s_isClaimed[transferId];
    }

    // GETTER FUNCTIONS //

    // Function that checks the ETH balance of the contract
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Function to get contract balance for a token
    function getBalanceForToken(
        address token
    ) external view onlyValidToken(token) returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    // Function to get the list of all allowed tokens
    function getAllowedTokens() external view returns (address[] memory) {
        return s_tokenList;
    }

    // Function to get the list of all tracked addresses
    function getTrackedAddresses() external view returns (address[] memory) {
        return s_addressList;
    }

    // Function to get all accumulated fees for a token
    function getAccumulatedFeesForToken(
        address token
    ) external view onlyValidToken(token) returns (uint256) {
        return s_feeBalances[token];
    }

    // Function to get all transfer fees
    function getTransferFees()
        external
        view
        returns (TransferFeeLibrary.TransferFee memory)
    {
        return transferFee;
    }

    // Function to get the transfer fee for a certain level
    function getTransferFee(uint8 level) external view returns (uint256) {
        if (level == 1) {
            return transferFee.lvlOne;
        } else if (level == 2) {
            return transferFee.lvlTwo;
        } else if (level == 3) {
            return transferFee.lvlThree;
        } else {
            revert PST__InvalidFeeLevel();
        }
    }

    // Function to get claim cooldown status and time remaining until elapsed for a transfer Id
    function getClaimCooldownStatus(
        uint256 transferId
    ) external view returns (bool isCoolDownActive, uint256 timeRemaining) {
        uint256 lastAttempt = s_lastFailedClaimAttempt[transferId];
        if (lastAttempt + s_claimCooldownPeriod >= block.timestamp) {
            return (
                true,
                (lastAttempt + s_claimCooldownPeriod) - block.timestamp
            );
        }
        return (false, 0);
    }

    // Function to get all pending transfers in the system
    function getPendingTransfers() external view returns (uint256[] memory) {
        return s_pendingTransferIds;
    }

    // Function to get all canceled transfers in the system
    function getCanceledTransfers() external view returns (uint256[] memory) {
        return s_canceledTransferIds;
    }

    // Function to get canceled transfers count
    function getCanceledTransferCount() external view returns (uint256) {
        return s_canceledTransferIds.length;
    }

    // Function to get all expired and refunded transfers in the system
    function getExpiredAndRefundedTransfers()
        external
        view
        returns (uint256[] memory)
    {
        return s_expiredAndRefundedTransferIds;
    }

    // Function to get expired and refunded transfers count
    function getExpiredAndRefundedTransferCount()
        external
        view
        returns (uint256)
    {
        return s_expiredAndRefundedTransferIds.length;
    }

    // Function to get all claimed transfers in the system
    function getClaimedTransfers() external view returns (uint256[] memory) {
        return s_claimedTransferIds;
    }

    // Function to get claimed transfers count
    function getClaimedTransferCount() external view returns (uint256) {
        return s_claimedTransferIds.length;
    }

    // Function to get all expired transfers in the system
    function getExpiredTransfers() public view returns (uint256[] memory) {
        uint256[] memory pendingTransfers = s_pendingTransferIds;
        uint256 expiredCount;

        for (uint256 i = 0; i < pendingTransfers.length; i++) {
            uint256 transferId = pendingTransfers[i];
            if (block.timestamp >= s_transfersById[transferId].expiringTime) {
                expiredCount++;
            }
        }

        uint256[] memory expiredTransfers = new uint256[](expiredCount);
        uint256 index;

        for (uint256 i = 0; i < pendingTransfers.length; i++) {
            uint256 transferId = pendingTransfers[i];
            if (block.timestamp >= s_transfersById[transferId].expiringTime) {
                expiredTransfers[index] = transferId;
                index++;
            }
        }

        return expiredTransfers;
    }

    // Function to get all pending transfers for an address
    function getPendingTransfersForAddress(
        address user
    ) external view onlyValidAddress(user) returns (uint256[] memory) {
        return s_pendingTransfersByAddress[user];
    }

    // Function to get all canceled transfers for an address
    function getCanceledTransfersForAddress(
        address user
    ) external view onlyValidAddress(user) returns (uint256[] memory) {
        return s_canceledTransfersByAddress[user];
    }

    // Function to get the count of canceled transfers for an address
    function getCanceledTransferForAddressCount(
        address user
    ) external view returns (uint256) {
        return s_canceledTransfersByAddress[user].length;
    }

    // Function to get all expired and refunded transfers for an address
    function getExpiredAndRefundedTransfersForAddress(
        address user
    ) external view onlyValidAddress(user) returns (uint256[] memory) {
        return s_expiredAndRefundedTransfersByAddress[user];
    }

    // Function to get the count of expired and refunded transfers for an address
    function getExpiredAndRefundedTransfersForAddressCount(
        address user
    ) external view returns (uint256) {
        return s_expiredAndRefundedTransfersByAddress[user].length;
    }

    // Function to get all claimed transfers for an address
    function getClaimedTransfersForAddress(
        address user
    ) external view onlyValidAddress(user) returns (uint256[] memory) {
        return s_claimedTransfersByAddress[user];
    }

    // Function to get the count of claimed transfers for an address
    function getClaimedTransfersForAddressCount(
        address user
    ) external view returns (uint256) {
        return s_claimedTransfersByAddress[user].length;
    }

    // Function to get all transfers for an address
    function getAllTransfersByAddress(
        address user
    )
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
    function getTransferDetails(
        uint256 transferId
    )
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

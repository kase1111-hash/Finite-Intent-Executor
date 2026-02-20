// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol"; // [Audit fix: M-2]
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IOracle.sol";

/**
 * @title IOptimisticOracleV3
 * @dev Interface for UMA's Optimistic Oracle V3
 * @notice Simplified interface for FIE integration
 */
interface IOptimisticOracleV3 {
    struct Assertion {
        address asserter;
        bool settled;
        bool settlementResolution;
        uint64 assertionTime;
        uint64 expirationTime;
    }

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId);

    function settleAssertion(bytes32 assertionId) external;

    function getAssertion(bytes32 assertionId) external view returns (Assertion memory);

    function disputeAssertion(bytes32 assertionId, address disputer) external;

    function getAssertionResult(bytes32 assertionId) external view returns (bool);

    function defaultIdentifier() external view returns (bytes32);
}

/**
 * @title UMAAdapter
 * @dev UMA Optimistic Oracle adapter for the Finite Intent Executor
 * @notice Provides dispute resolution through economic security
 *
 * The UMA Optimistic Oracle works differently from Chainlink:
 * 1. An asserter makes a claim (e.g., "person X has died")
 * 2. A bond is posted with the assertion
 * 3. There's a dispute window where challengers can dispute
 * 4. If disputed, UMA's Data Verification Mechanism (DVM) resolves it
 * 5. If not disputed, the assertion is accepted as valid
 *
 * This provides economic security - disputing requires a bond, and the
 * loser forfeits their bond to the winner.
 */
contract UMAAdapter is IOracle, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @dev Minimum confidence score required (always 100 for UMA - binary outcome)
    uint256 public constant MIN_CONFIDENCE_THRESHOLD = 100;

    /// @dev Default liveness period (dispute window) - 2 hours for testing, 24-48h for production
    uint64 public constant DEFAULT_LIVENESS = 2 hours;

    /// @dev Default bond amount (in currency tokens)
    uint256 public constant DEFAULT_BOND = 1000e18;

    /// @dev Maximum requests per creator to prevent unbounded array growth [Audit fix: M-11]
    uint256 public constant MAX_REQUESTS_PER_CREATOR = 1000;

    /// @dev Whether the oracle is currently accepting requests
    bool private _isActive;

    /// @dev UMA Optimistic Oracle V3 contract
    IOptimisticOracleV3 public optimisticOracle;

    /// @dev Currency token for bonds (usually USDC or UMA)
    IERC20 public bondCurrency;

    /// @dev Bond amount required for assertions
    uint256 public bondAmount;

    /// @dev Liveness period for disputes
    uint64 public livenessPeriod;

    /// @dev Domain ID for FIE assertions
    bytes32 public constant FIE_DOMAIN_ID = keccak256("FIE_DEATH_VERIFICATION");

    /// @dev Mapping of request ID to verification request
    mapping(bytes32 => VerificationRequest) public requests;

    /// @dev Mapping of request ID to UMA assertion ID
    mapping(bytes32 => bytes32) public requestToAssertion;

    /// @dev Mapping of UMA assertion ID to request ID
    mapping(bytes32 => bytes32) public assertionToRequest;

    /// @dev Mapping of creator address to their request IDs
    mapping(address => bytes32[]) public creatorRequests;

    /// @dev Nonce for generating unique request IDs
    uint256 private _requestNonce;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event OracleConfigUpdated(address oracle, address currency, uint256 bond, uint64 liveness);
    event OracleActiveStatusChanged(bool isActive);
    event AssertionCreated(bytes32 indexed requestId, bytes32 indexed assertionId, address asserter);
    event AssertionDisputed(bytes32 indexed requestId, bytes32 indexed assertionId, address disputer);
    event AssertionSettled(bytes32 indexed requestId, bytes32 indexed assertionId, bool result);

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    /**
     * @dev Constructor for UMAAdapter
     * @param _optimisticOracle Address of UMA Optimistic Oracle V3
     * @param _bondCurrency Address of bond currency token
     * @param _bondAmount Bond amount for assertions
     * @param _liveness Liveness period for disputes
     */
    constructor(
        address _optimisticOracle,
        address _bondCurrency,
        uint256 _bondAmount,
        uint64 _liveness
    ) Ownable(msg.sender) {
        require(_optimisticOracle != address(0), "Invalid oracle address"); // [Audit fix: L-14]
        require(_bondCurrency != address(0), "Invalid currency address"); // [Audit fix: L-14]
        optimisticOracle = IOptimisticOracleV3(_optimisticOracle);
        bondCurrency = IERC20(_bondCurrency);
        bondAmount = _bondAmount > 0 ? _bondAmount : DEFAULT_BOND;
        livenessPeriod = _liveness > 0 ? _liveness : DEFAULT_LIVENESS;
        _isActive = true;
    }

    // =============================================================================
    // MODIFIERS
    // =============================================================================

    modifier onlyActive() {
        require(_isActive, "Oracle is not active");
        _;
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Update UMA oracle configuration
     * @param _oracle New oracle address
     * @param _currency New currency address
     * @param _bond New bond amount
     * @param _liveness New liveness period
     */
    function updateOracleConfig(
        address _oracle,
        address _currency,
        uint256 _bond,
        uint64 _liveness
    ) external onlyOwner {
        if (_oracle != address(0)) {
            optimisticOracle = IOptimisticOracleV3(_oracle);
        }
        if (_currency != address(0)) {
            bondCurrency = IERC20(_currency);
        }
        if (_bond > 0) {
            bondAmount = _bond;
        }
        if (_liveness > 0) {
            livenessPeriod = _liveness;
        }
        emit OracleConfigUpdated(
            address(optimisticOracle),
            address(bondCurrency),
            bondAmount,
            livenessPeriod
        );
    }

    /**
     * @dev Set oracle active status
     * @param _active Whether oracle should be active
     */
    function setActive(bool _active) external onlyOwner {
        _isActive = _active;
        emit OracleActiveStatusChanged(_active);
    }

    // =============================================================================
    // IORACLE IMPLEMENTATION
    // =============================================================================

    /**
     * @inheritdoc IOracle
     * @notice For UMA, this creates a pending request. Use assertVerification() to make the actual assertion.
     */
    function requestVerification(
        address _creator,
        EventType _eventType,
        bytes32 _dataHash
    ) external override onlyActive nonReentrant returns (bytes32 requestId) {
        require(_creator != address(0), "Invalid creator address");
        require(_dataHash != bytes32(0), "Invalid data hash");

        // Generate unique request ID
        requestId = keccak256(abi.encodePacked(
            _creator,
            _eventType,
            _dataHash,
            block.timestamp,
            _requestNonce++
        ));

        // Create verification request (pending until assertion made)
        requests[requestId] = VerificationRequest({
            requestId: requestId,
            creator: _creator,
            eventType: _eventType,
            dataHash: _dataHash,
            requestTimestamp: block.timestamp,
            expirationTimestamp: 0, // Set when assertion made
            status: VerificationStatus.Pending,
            confidenceScore: 0
        });

        // Track request for creator [Audit fix: M-11]
        require(creatorRequests[_creator].length < MAX_REQUESTS_PER_CREATOR, "Request limit reached");
        creatorRequests[_creator].push(requestId);

        emit VerificationRequested(requestId, _creator, _eventType, block.timestamp);

        return requestId;
    }

    /**
     * @inheritdoc IOracle
     */
    function getVerificationStatus(bytes32 _requestId)
        external view override returns (VerificationRequest memory request)
    {
        request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        return request;
    }

    /**
     * @inheritdoc IOracle
     */
    function isVerificationValid(bytes32 _requestId)
        external view override returns (bool isValid)
    {
        VerificationRequest memory request = requests[_requestId];

        // Check request exists
        if (request.requestTimestamp == 0) {
            return false;
        }

        // Check verified status
        if (request.status != VerificationStatus.Verified) {
            return false;
        }

        // For UMA, confidence is always 100 (binary outcome)
        return request.confidenceScore >= MIN_CONFIDENCE_THRESHOLD;
    }

    /**
     * @inheritdoc IOracle
     */
    function getOracleType() external pure override returns (string memory) {
        return "uma";
    }

    /**
     * @inheritdoc IOracle
     */
    function isActive() external view override returns (bool) {
        return _isActive;
    }

    // =============================================================================
    // UMA-SPECIFIC FUNCTIONS
    // =============================================================================

    /**
     * @dev Make an assertion for a verification request
     * @param _requestId The request to assert
     * @param _claim Human-readable claim (e.g., "Person 0x... died on 2025-01-01")
     * @return assertionId The UMA assertion ID
     *
     * The caller must have approved bondAmount of bondCurrency to this contract.
     */
    function assertVerification(
        bytes32 _requestId,
        bytes memory _claim
    ) external nonReentrant returns (bytes32 assertionId) {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.status == VerificationStatus.Pending, "Request not pending");
        require(requestToAssertion[_requestId] == bytes32(0), "Already asserted");

        // Transfer bond from asserter
        bondCurrency.safeTransferFrom(msg.sender, address(this), bondAmount);

        // Approve oracle to spend bond [Audit fix: L-6] — reset to 0 first for tokens that require it
        bondCurrency.forceApprove(address(optimisticOracle), bondAmount);

        // Make assertion to UMA
        assertionId = optimisticOracle.assertTruth(
            _claim,
            msg.sender,                    // asserter
            address(this),                 // callback recipient
            address(0),                    // escalation manager (none)
            livenessPeriod,
            bondCurrency,
            bondAmount,
            optimisticOracle.defaultIdentifier(),
            FIE_DOMAIN_ID
        );

        // Store mappings
        requestToAssertion[_requestId] = assertionId;
        assertionToRequest[assertionId] = _requestId;

        // Update expiration based on liveness
        request.expirationTimestamp = block.timestamp + livenessPeriod + 1 days;

        emit AssertionCreated(_requestId, assertionId, msg.sender);

        return assertionId;
    }

    /**
     * @dev Settle an assertion after liveness period
     * @param _requestId The request to settle
     *
     * Can be called by anyone after the liveness period.
     */
    function settleVerification(bytes32 _requestId) external nonReentrant {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.status == VerificationStatus.Pending, "Request not pending");

        bytes32 assertionId = requestToAssertion[_requestId];
        require(assertionId != bytes32(0), "No assertion made");

        // Settle with UMA
        optimisticOracle.settleAssertion(assertionId);

        // Get result
        IOptimisticOracleV3.Assertion memory assertion = optimisticOracle.getAssertion(assertionId);
        require(assertion.settled, "Assertion not settled");

        if (assertion.settlementResolution) {
            request.status = VerificationStatus.Verified;
            request.confidenceScore = 100; // Binary - if settled true, 100% confidence
        } else {
            request.status = VerificationStatus.Rejected;
            request.confidenceScore = 0;
        }

        emit AssertionSettled(_requestId, assertionId, assertion.settlementResolution);
        emit VerificationFulfilled(_requestId, request.creator, request.status, request.confidenceScore);
    }

    /**
     * @dev Dispute an assertion (requires bond)
     * @param _requestId The request to dispute
     *
     * The caller must have approved bondAmount of bondCurrency to this contract.
     */
    function disputeVerification(bytes32 _requestId) external nonReentrant {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.status == VerificationStatus.Pending, "Request not pending");

        bytes32 assertionId = requestToAssertion[_requestId];
        require(assertionId != bytes32(0), "No assertion to dispute");

        // Transfer bond from disputer
        bondCurrency.safeTransferFrom(msg.sender, address(this), bondAmount);

        // Approve oracle to spend bond [Audit fix: L-6] — reset to 0 first for tokens that require it
        bondCurrency.forceApprove(address(optimisticOracle), bondAmount);

        // Dispute with UMA
        optimisticOracle.disputeAssertion(assertionId, msg.sender);

        // Mark as disputed
        request.status = VerificationStatus.Disputed;

        emit AssertionDisputed(_requestId, assertionId, msg.sender);
        emit VerificationDisputed(_requestId, msg.sender, "Dispute filed with UMA DVM");
    }

    /**
     * @dev Callback from UMA when assertion is resolved (after dispute)
     * @param assertionId The UMA assertion ID
     * @param assertedTruthfully Whether the assertion was true
     *
     * This is called by UMA after DVM resolution.
     */
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external {
        require(msg.sender == address(optimisticOracle), "Only oracle can callback");

        bytes32 requestId = assertionToRequest[assertionId];
        require(requestId != bytes32(0), "Unknown assertion");

        VerificationRequest storage request = requests[requestId];

        if (assertedTruthfully) {
            request.status = VerificationStatus.Verified;
            request.confidenceScore = 100;
        } else {
            request.status = VerificationStatus.Rejected;
            request.confidenceScore = 0;
        }

        emit AssertionSettled(requestId, assertionId, assertedTruthfully);
        emit VerificationFulfilled(requestId, request.creator, request.status, request.confidenceScore);
    }

    /**
     * @dev Callback from UMA when assertion is disputed
     * @param assertionId The UMA assertion ID
     *
     * This is called by UMA when someone disputes.
     */
    function assertionDisputedCallback(bytes32 assertionId) external {
        require(msg.sender == address(optimisticOracle), "Only oracle can callback");

        bytes32 requestId = assertionToRequest[assertionId];
        if (requestId != bytes32(0)) {
            requests[requestId].status = VerificationStatus.Disputed;
        }
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Get all request IDs for a creator
     */
    function getCreatorRequests(address _creator)
        external view returns (bytes32[] memory)
    {
        return creatorRequests[_creator];
    }

    /**
     * @dev Get UMA assertion ID for a request
     */
    function getAssertionId(bytes32 _requestId)
        external view returns (bytes32)
    {
        return requestToAssertion[_requestId];
    }

    /**
     * @dev Get assertion details from UMA
     */
    function getAssertionDetails(bytes32 _requestId)
        external view returns (
            bool hasAssertion,
            bool settled,
            bool result,
            uint64 assertionTime,
            uint64 expirationTime
        )
    {
        bytes32 assertionId = requestToAssertion[_requestId];
        if (assertionId == bytes32(0)) {
            return (false, false, false, 0, 0);
        }

        IOptimisticOracleV3.Assertion memory assertion = optimisticOracle.getAssertion(assertionId);
        return (
            true,
            assertion.settled,
            assertion.settlementResolution,
            assertion.assertionTime,
            assertion.expirationTime
        );
    }

    /**
     * @dev Check if liveness period has passed for an assertion
     */
    function canSettle(bytes32 _requestId) external view returns (bool) {
        bytes32 assertionId = requestToAssertion[_requestId];
        if (assertionId == bytes32(0)) {
            return false;
        }

        IOptimisticOracleV3.Assertion memory assertion = optimisticOracle.getAssertion(assertionId);
        return !assertion.settled && block.timestamp >= assertion.expirationTime;
    }

    /**
     * @dev Get current bond configuration
     */
    function getBondConfig()
        external view returns (address currency, uint256 amount, uint64 liveness)
    {
        return (address(bondCurrency), bondAmount, livenessPeriod);
    }
}

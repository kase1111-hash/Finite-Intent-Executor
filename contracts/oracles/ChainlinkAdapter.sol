// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol"; // [Audit fix: M-2]
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IOracle.sol";

/**
 * @title ChainlinkAdapter
 * @dev Chainlink Any API adapter for the Finite Intent Executor
 * @notice Connects to Chainlink oracle network for external data verification
 *
 * This adapter uses Chainlink's Any API feature to:
 * 1. Request verification of death/medical/legal events from external APIs
 * 2. Receive callback with verification results
 * 3. Store results for TriggerMechanism to query
 *
 * In production, this connects to actual Chainlink nodes. For testing,
 * it can be operated in "direct" mode where authorized operators fulfill requests.
 */
contract ChainlinkAdapter is IOracle, Ownable2Step, ReentrancyGuard {

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @dev Minimum confidence score required for valid verification (95%)
    uint256 public constant MIN_CONFIDENCE_THRESHOLD = 95;

    /// @dev Default request expiration time (7 days)
    uint256 public constant DEFAULT_EXPIRATION = 7 days;

    /// @dev Maximum requests per creator to prevent unbounded array growth [Audit fix: M-11]
    uint256 public constant MAX_REQUESTS_PER_CREATOR = 1000;

    /// @dev Whether the oracle is currently accepting requests
    bool private _isActive;

    /// @dev Chainlink LINK token address (for payment)
    address public linkToken;

    /// @dev Chainlink oracle address (for requests)
    address public chainlinkOracle;

    /// @dev Chainlink job ID for verification requests
    bytes32 public jobId;

    /// @dev Fee in LINK for each request
    uint256 public oracleFee;

    /// @dev Mapping of request ID to verification request
    mapping(bytes32 => VerificationRequest) public requests;

    /// @dev Mapping of creator address to their pending request IDs
    mapping(address => bytes32[]) public creatorRequests;

    /// @dev Mapping of authorized operators (for direct fulfillment mode)
    mapping(address => bool) public authorizedOperators;

    /// @dev Nonce for generating unique request IDs
    uint256 private _requestNonce;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event OperatorAuthorized(address indexed operator, bool authorized);
    event OracleConfigUpdated(address oracle, bytes32 jobId, uint256 fee);
    event OracleActiveStatusChanged(bool isActive);
    /// @custom:audit-fix L-19 — distinct event for expired requests (was reusing VerificationFulfilled)
    event RequestExpired(bytes32 indexed requestId, address indexed creator);

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    /**
     * @dev Constructor for ChainlinkAdapter
     * @param _linkToken Address of LINK token (use address(0) for testing mode)
     * @param _oracle Address of Chainlink oracle (use address(0) for direct mode)
     * @param _jobId Job ID for verification requests
     * @param _fee Fee in LINK for requests
     */
    constructor(
        address _linkToken,
        address _oracle,
        bytes32 _jobId,
        uint256 _fee
    ) Ownable(msg.sender) {
        linkToken = _linkToken;
        chainlinkOracle = _oracle;
        jobId = _jobId;
        oracleFee = _fee;
        _isActive = true;

        // [Audit fix: M-3] Removed auto-authorization of deployer as operator.
        // Owner should explicitly call setOperator() to grant operator role,
        // enforcing principle of least privilege.
    }

    // =============================================================================
    // MODIFIERS
    // =============================================================================

    modifier onlyOperator() {
        require(authorizedOperators[msg.sender], "Not an authorized operator");
        _;
    }

    modifier onlyActive() {
        require(_isActive, "Oracle is not active");
        _;
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Set operator authorization status
     * @param _operator Address of the operator
     * @param _authorized Whether to authorize or revoke
     */
    function setOperator(address _operator, bool _authorized) external onlyOwner {
        require(_operator != address(0), "Invalid operator address");
        authorizedOperators[_operator] = _authorized;
        emit OperatorAuthorized(_operator, _authorized);
    }

    /**
     * @dev Update Chainlink oracle configuration
     * @param _oracle New oracle address
     * @param _jobId New job ID
     * @param _fee New fee amount
     */
    function updateOracleConfig(
        address _oracle,
        bytes32 _jobId,
        uint256 _fee
    ) external onlyOwner {
        chainlinkOracle = _oracle;
        jobId = _jobId;
        oracleFee = _fee;
        emit OracleConfigUpdated(_oracle, _jobId, _fee);
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

        // Create verification request
        requests[requestId] = VerificationRequest({
            requestId: requestId,
            creator: _creator,
            eventType: _eventType,
            dataHash: _dataHash,
            requestTimestamp: block.timestamp,
            expirationTimestamp: block.timestamp + DEFAULT_EXPIRATION,
            status: VerificationStatus.Pending,
            confidenceScore: 0
        });

        // Track request for creator [Audit fix: M-11]
        require(creatorRequests[_creator].length < MAX_REQUESTS_PER_CREATOR, "Request limit reached");
        creatorRequests[_creator].push(requestId);

        emit VerificationRequested(requestId, _creator, _eventType, block.timestamp);

        // In production, this would make a Chainlink request:
        // _sendChainlinkRequest(requestId, _dataHash, _eventType);

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

        // Check not expired
        if (block.timestamp > request.expirationTimestamp) {
            return false;
        }

        // Check verified status
        if (request.status != VerificationStatus.Verified) {
            return false;
        }

        // Check confidence threshold
        if (request.confidenceScore < MIN_CONFIDENCE_THRESHOLD) {
            return false;
        }

        return true;
    }

    /**
     * @inheritdoc IOracle
     */
    function getOracleType() external pure override returns (string memory) {
        return "chainlink";
    }

    /**
     * @inheritdoc IOracle
     */
    function isActive() external view override returns (bool) {
        return _isActive;
    }

    // =============================================================================
    // FULFILLMENT FUNCTIONS
    // =============================================================================

    /**
     * @dev Fulfill a verification request (called by Chainlink or operator)
     * @param _requestId The request to fulfill
     * @param _status The verification status
     * @param _confidenceScore Confidence score (0-100)
     *
     * In production, this is called by Chainlink callback.
     * In testing/direct mode, authorized operators can call this.
     */
    function fulfillVerification(
        bytes32 _requestId,
        VerificationStatus _status,
        uint256 _confidenceScore
    ) external onlyOperator nonReentrant {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.status == VerificationStatus.Pending, "Request already fulfilled");
        require(block.timestamp <= request.expirationTimestamp, "Request expired");
        require(_confidenceScore <= 100, "Invalid confidence score");

        request.status = _status;
        request.confidenceScore = _confidenceScore;

        emit VerificationFulfilled(
            _requestId,
            request.creator,
            _status,
            _confidenceScore
        );
    }

    /**
     * @dev Mark a request as expired
     * @param _requestId The request to expire
     */
    function expireRequest(bytes32 _requestId) external {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.status == VerificationStatus.Pending, "Request already resolved");
        require(block.timestamp > request.expirationTimestamp, "Request not yet expired");

        request.status = VerificationStatus.Expired;

        emit RequestExpired(_requestId, request.creator); // [Audit fix: L-19]
    }

    /**
     * @dev Dispute a verification result
     * @param _requestId The request to dispute
     * @param _reason Reason for dispute
     */
    function disputeVerification(bytes32 _requestId, string calldata _reason) external {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.creator == msg.sender, "Only creator can dispute"); // [Audit fix: L-3]
        require(
            request.status == VerificationStatus.Verified ||
            request.status == VerificationStatus.Rejected,
            "Can only dispute resolved requests"
        );
        require(block.timestamp <= request.expirationTimestamp, "Dispute period expired");

        request.status = VerificationStatus.Disputed;

        emit VerificationDisputed(_requestId, msg.sender, _reason);
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Get all request IDs for a creator
     * @param _creator The creator address
     * @return requestIds Array of request IDs
     */
    function getCreatorRequests(address _creator)
        external view returns (bytes32[] memory requestIds)
    {
        return creatorRequests[_creator];
    }

    /**
     * @dev Get the latest verified request for a creator
     * @param _creator The creator address
     * @return requestId The latest verified request ID (or bytes32(0) if none)
     * @return isValid Whether the verification is currently valid
     */
    function getLatestVerifiedRequest(address _creator)
        external view returns (bytes32 requestId, bool isValid)
    {
        bytes32[] memory requests_ = creatorRequests[_creator];

        for (uint256 i = requests_.length; i > 0; i--) {
            bytes32 rid = requests_[i - 1];
            VerificationRequest memory req = requests[rid];

            if (req.status == VerificationStatus.Verified) {
                bool valid = req.confidenceScore >= MIN_CONFIDENCE_THRESHOLD &&
                            block.timestamp <= req.expirationTimestamp;
                return (rid, valid);
            }
        }

        return (bytes32(0), false);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol"; // [Audit fix: M-2]
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IOracle.sol";

/**
 * @title OracleRegistry
 * @dev Registry and aggregator for multiple oracle adapters
 * @notice Manages oracle registration, verification consensus, and reputation
 *
 * The OracleRegistry provides:
 * 1. Registration of multiple oracle adapters (Chainlink, UMA, ZK, etc.)
 * 2. Multi-oracle consensus for critical verifications
 * 3. Reputation tracking for oracle reliability
 * 4. Fallback mechanisms when oracles are unavailable
 */
contract OracleRegistry is Ownable2Step, ReentrancyGuard {

    // =============================================================================
    // STRUCTS
    // =============================================================================

    struct OracleInfo {
        address oracleAddress;
        string oracleType;          // "chainlink", "uma", "zk", etc.
        bool isActive;
        uint256 registrationTime;
        uint256 successfulVerifications;
        uint256 failedVerifications;
        uint256 disputedVerifications;
        uint256 reputationScore;    // 0-100
    }

    struct AggregatedVerification {
        bytes32 aggregationId;
        address creator;
        IOracle.EventType eventType;
        bytes32 dataHash;
        uint256 requestTimestamp;
        uint256 requiredOracles;    // Number of oracles required for consensus
        uint256 receivedVerifications;
        uint256 positiveVerifications;
        uint256 averageConfidence;
        bool isComplete;
        bool isValid;
    }

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @dev Minimum reputation score for oracle to participate (default: 50)
    uint256 public minReputationThreshold = 50;

    /// @dev Default number of oracles required for consensus
    /// @custom:audit-fix M-5 — increased from 1 to 2 to prevent single-oracle attacks
    uint256 public defaultConsensusThreshold = 2;

    /// @dev Maximum number of oracles that can be registered
    uint256 public constant MAX_ORACLES = 20;

    /// @dev List of registered oracle addresses
    address[] public oracleList;

    /// @dev Mapping of oracle address to info
    mapping(address => OracleInfo) public oracles;

    /// @dev Mapping of aggregation ID to aggregated verification
    mapping(bytes32 => AggregatedVerification) public aggregations;

    /// @dev Mapping of aggregation ID to oracle responses
    mapping(bytes32 => mapping(address => bool)) public oracleResponded;

    /// @dev Mapping of aggregation ID to oracle verification results
    mapping(bytes32 => mapping(address => bool)) public oracleVerificationResult;

    /// @dev Nonce for generating unique aggregation IDs
    uint256 private _aggregationNonce;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event OracleRegistered(address indexed oracle, string oracleType);
    event OracleDeactivated(address indexed oracle);
    event OracleReactivated(address indexed oracle);
    event OracleReputationUpdated(address indexed oracle, uint256 newScore);
    event AggregatedVerificationRequested(
        bytes32 indexed aggregationId,
        address indexed creator,
        IOracle.EventType eventType,
        uint256 requiredOracles
    );
    event OracleVerificationReceived(
        bytes32 indexed aggregationId,
        address indexed oracle,
        bool result,
        uint256 confidence
    );
    event AggregatedVerificationComplete(
        bytes32 indexed aggregationId,
        bool isValid,
        uint256 averageConfidence
    );
    event ConsensusThresholdUpdated(uint256 newThreshold);
    event ReputationThresholdUpdated(uint256 newThreshold);

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() Ownable(msg.sender) {}

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Register a new oracle adapter
     * @param _oracle Address of the oracle contract
     */
    function registerOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle address");
        require(!oracles[_oracle].isActive, "Oracle already registered");
        require(oracleList.length < MAX_ORACLES, "Maximum oracles reached");

        string memory oracleType = IOracle(_oracle).getOracleType();

        oracles[_oracle] = OracleInfo({
            oracleAddress: _oracle,
            oracleType: oracleType,
            isActive: true,
            registrationTime: block.timestamp,
            successfulVerifications: 0,
            failedVerifications: 0,
            disputedVerifications: 0,
            reputationScore: 75  // Starting reputation
        });

        oracleList.push(_oracle);

        emit OracleRegistered(_oracle, oracleType);
    }

    /**
     * @dev Deactivate an oracle
     * @param _oracle Address of the oracle to deactivate
     */
    function deactivateOracle(address _oracle) external onlyOwner {
        require(oracles[_oracle].isActive, "Oracle not active");
        oracles[_oracle].isActive = false;
        emit OracleDeactivated(_oracle);
    }

    /**
     * @dev Reactivate an oracle
     * @param _oracle Address of the oracle to reactivate
     */
    function reactivateOracle(address _oracle) external onlyOwner {
        require(oracles[_oracle].oracleAddress != address(0), "Oracle not registered");
        require(!oracles[_oracle].isActive, "Oracle already active");
        oracles[_oracle].isActive = true;
        emit OracleReactivated(_oracle);
    }

    /**
     * @dev Update consensus threshold
     * @param _threshold New threshold (must be >= 1)
     */
    function setConsensusThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold >= 1, "Threshold must be at least 1");
        require(_threshold <= oracleList.length, "Threshold exceeds oracle count");
        defaultConsensusThreshold = _threshold;
        emit ConsensusThresholdUpdated(_threshold);
    }

    /**
     * @dev Update minimum reputation threshold
     * @param _threshold New threshold (0-100)
     */
    function setReputationThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold <= 100, "Threshold must be <= 100");
        minReputationThreshold = _threshold;
        emit ReputationThresholdUpdated(_threshold);
    }

    // =============================================================================
    // VERIFICATION FUNCTIONS
    // =============================================================================

    /**
     * @dev Request aggregated verification from multiple oracles
     * @param _creator Address of the intent creator
     * @param _eventType Type of event to verify
     * @param _dataHash Hash of supporting data
     * @param _requiredOracles Number of oracles required (0 = use default)
     * @return aggregationId Unique identifier for the aggregation
     */
    function requestAggregatedVerification(
        address _creator,
        IOracle.EventType _eventType,
        bytes32 _dataHash,
        uint256 _requiredOracles
    ) external nonReentrant returns (bytes32 aggregationId) {
        require(_creator != address(0), "Invalid creator");
        require(_dataHash != bytes32(0), "Invalid data hash");

        uint256 required = _requiredOracles > 0 ? _requiredOracles : defaultConsensusThreshold;
        uint256 activeOracles = getActiveOracleCount();
        require(activeOracles >= required, "Not enough active oracles");

        aggregationId = keccak256(abi.encodePacked(
            _creator,
            _eventType,
            _dataHash,
            block.timestamp,
            _aggregationNonce++
        ));

        aggregations[aggregationId] = AggregatedVerification({
            aggregationId: aggregationId,
            creator: _creator,
            eventType: _eventType,
            dataHash: _dataHash,
            requestTimestamp: block.timestamp,
            requiredOracles: required,
            receivedVerifications: 0,
            positiveVerifications: 0,
            averageConfidence: 0,
            isComplete: false,
            isValid: false
        });

        // Request verification from all active oracles
        // [Audit fix: M-8] Wrapped in try/catch — a single reverting oracle no longer DoS-es aggregation
        for (uint256 i = 0; i < oracleList.length; i++) {
            address oracleAddr = oracleList[i];
            OracleInfo memory info = oracles[oracleAddr];

            if (info.isActive && info.reputationScore >= minReputationThreshold) {
                try IOracle(oracleAddr).requestVerification(_creator, _eventType, _dataHash) {
                    // success
                } catch {
                    // Oracle failed — skip and continue with remaining oracles
                }
            }
        }

        emit AggregatedVerificationRequested(aggregationId, _creator, _eventType, required);

        return aggregationId;
    }

    /**
     * @dev Submit oracle verification result for aggregation
     * @param _aggregationId The aggregation identifier
     * @param _isVerified Whether the oracle verified the event
     * @param _confidence Confidence score (0-100)
     */
    function submitOracleResult(
        bytes32 _aggregationId,
        bool _isVerified,
        uint256 _confidence
    ) external nonReentrant {
        require(oracles[msg.sender].isActive, "Not an active oracle");
        require(!oracleResponded[_aggregationId][msg.sender], "Already responded");
        require(_confidence <= 100, "Invalid confidence");

        AggregatedVerification storage agg = aggregations[_aggregationId];
        require(agg.requestTimestamp > 0, "Aggregation does not exist");
        require(!agg.isComplete, "Aggregation already complete");

        oracleResponded[_aggregationId][msg.sender] = true;
        oracleVerificationResult[_aggregationId][msg.sender] = _isVerified;

        agg.receivedVerifications++;
        if (_isVerified && _confidence >= 95) {
            agg.positiveVerifications++;
        }

        // Update running average
        agg.averageConfidence = ((agg.averageConfidence * (agg.receivedVerifications - 1)) + _confidence) / agg.receivedVerifications;

        emit OracleVerificationReceived(_aggregationId, msg.sender, _isVerified, _confidence);

        // Check if consensus reached
        if (agg.receivedVerifications >= agg.requiredOracles) {
            _finalizeAggregation(_aggregationId);
        }
    }

    /**
     * @dev Finalize aggregation when enough responses received
     */
    function _finalizeAggregation(bytes32 _aggregationId) internal {
        AggregatedVerification storage agg = aggregations[_aggregationId];

        agg.isComplete = true;

        // Require majority of required oracles to verify positively
        uint256 requiredPositive = (agg.requiredOracles / 2) + 1;
        agg.isValid = agg.positiveVerifications >= requiredPositive &&
                      agg.averageConfidence >= 95;

        // Update oracle reputations
        _updateOracleReputations(_aggregationId, agg.isValid);

        emit AggregatedVerificationComplete(_aggregationId, agg.isValid, agg.averageConfidence);
    }

    /**
     * @dev Update oracle reputations based on consensus agreement
     */
    function _updateOracleReputations(bytes32 _aggregationId, bool _consensusResult) internal {
        for (uint256 i = 0; i < oracleList.length; i++) {
            address oracleAddr = oracleList[i];

            if (oracleResponded[_aggregationId][oracleAddr]) {
                bool oracleResult = oracleVerificationResult[_aggregationId][oracleAddr];
                OracleInfo storage info = oracles[oracleAddr];

                if (oracleResult == _consensusResult) {
                    // Oracle agreed with consensus - increase reputation
                    info.successfulVerifications++;
                    if (info.reputationScore < 100) {
                        info.reputationScore = info.reputationScore + 1 > 100 ? 100 : info.reputationScore + 1;
                    }
                } else {
                    // Oracle disagreed with consensus - decrease reputation
                    info.failedVerifications++;
                    if (info.reputationScore > 0) {
                        info.reputationScore = info.reputationScore > 5 ? info.reputationScore - 5 : 0;
                    }
                }

                emit OracleReputationUpdated(oracleAddr, info.reputationScore);
            }
        }
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Get number of active oracles
     */
    function getActiveOracleCount() public view returns (uint256 count) {
        for (uint256 i = 0; i < oracleList.length; i++) {
            if (oracles[oracleList[i]].isActive &&
                oracles[oracleList[i]].reputationScore >= minReputationThreshold) {
                count++;
            }
        }
        return count;
    }

    /**
     * @dev Get all registered oracle addresses
     */
    function getAllOracles() external view returns (address[] memory) {
        return oracleList;
    }

    /**
     * @dev Get oracle info
     */
    function getOracleInfo(address _oracle) external view returns (OracleInfo memory) {
        return oracles[_oracle];
    }

    /**
     * @dev Get aggregation status
     */
    function getAggregation(bytes32 _aggregationId)
        external view returns (AggregatedVerification memory)
    {
        return aggregations[_aggregationId];
    }

    /**
     * @dev Check if aggregation is valid and complete
     */
    function isAggregationValid(bytes32 _aggregationId) external view returns (bool) {
        AggregatedVerification memory agg = aggregations[_aggregationId];
        return agg.isComplete && agg.isValid;
    }

    /**
     * @dev Get oracles with sufficient reputation for verification
     */
    function getEligibleOracles() external view returns (address[] memory eligible) {
        uint256 count = getActiveOracleCount();
        eligible = new address[](count);

        uint256 index = 0;
        for (uint256 i = 0; i < oracleList.length; i++) {
            address oracleAddr = oracleList[i];
            if (oracles[oracleAddr].isActive &&
                oracles[oracleAddr].reputationScore >= minReputationThreshold) {
                eligible[index++] = oracleAddr;
            }
        }

        return eligible;
    }
}

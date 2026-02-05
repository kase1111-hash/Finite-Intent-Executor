// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./oracles/IOracle.sol";
import "./oracles/OracleRegistry.sol";
import "./oracles/ZKVerifierAdapter.sol";

interface IIntentCaptureModule {
    function triggerIntent(address _creator) external;
    function getIntent(address _creator) external view returns (
        bytes32 intentHash,
        bytes32 corpusHash,
        string memory corpusURI,
        string memory assetsURI,
        uint256 captureTimestamp,
        uint256 corpusStartYear,
        uint256 corpusEndYear,
        address[] memory assetAddresses,
        bool isRevoked,
        bool isTriggered
    );
}

/**
 * @title TriggerMechanism
 * @dev Implements deadman switch, trusted-signature quorum, and oracle-based triggers
 * Provides atomic, irreversible transfer of control upon valid trigger
 *
 * @notice Enhanced oracle integration supports:
 * - Direct oracle verification (legacy mode)
 * - OracleRegistry-based multi-oracle consensus
 * - ZK proof verification (when enabled)
 */
contract TriggerMechanism is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    enum TriggerType {
        DeadmanSwitch,
        TrustedQuorum,
        OracleVerified
    }

    /// @dev Oracle verification mode for enhanced security
    enum OracleMode {
        Direct,             // Legacy: trust individual oracle addresses directly
        Registry,           // Use OracleRegistry for multi-oracle consensus
        ZKProof             // Require zero-knowledge proof verification
    }

    struct TriggerConfig {
        TriggerType triggerType;
        uint256 deadmanInterval;     // For deadman: seconds of inactivity before trigger
        uint256 lastCheckIn;          // Last time creator checked in
        address[] trustedSigners;     // For quorum: trusted addresses
        uint256 requiredSignatures;   // Number of signatures needed
        address[] oracles;            // For oracle: verified oracle addresses (legacy)
        bool isConfigured;
        bool isTriggered;
    }

    /// @dev Extended oracle configuration for enhanced verification
    struct OracleConfig {
        OracleMode mode;
        IOracle.EventType eventType;    // Type of event to verify (death, incapacitation, etc.)
        bytes32 dataHash;               // Hash of verification data (for privacy)
        bytes32 aggregationId;          // OracleRegistry aggregation ID (if using Registry mode)
        bytes32 zkRequestId;            // ZKVerifierAdapter request ID (if using ZKProof mode)
        bytes32 zkKeyId;                // ZK verification key ID (if using ZKProof mode)
        uint256 requiredConfidence;     // Minimum confidence score (default: 95)
        bool useRegistry;               // Whether to use OracleRegistry
    }

    IIntentCaptureModule public intentModule;
    OracleRegistry public oracleRegistry;
    ZKVerifierAdapter public zkVerifier;

    mapping(address => TriggerConfig) public triggers;
    mapping(address => OracleConfig) public oracleConfigs;
    mapping(address => mapping(address => bool)) public hasSignedTrigger;
    mapping(address => uint256) public signatureCount;

    /// @dev Minimum confidence threshold for oracle verification (matches ExecutionAgent)
    uint256 public constant MIN_CONFIDENCE_THRESHOLD = 95;

    /// @dev Maximum number of trusted signers allowed to prevent DoS in loops
    uint256 public constant MAX_TRUSTED_SIGNERS = 20;

    /// @dev Maximum number of oracles allowed to prevent DoS in loops
    uint256 public constant MAX_ORACLES = 10;

    event TriggerConfigured(address indexed creator, TriggerType triggerType);
    event DeadmanCheckIn(address indexed creator, uint256 timestamp);
    event TrustedSignatureReceived(address indexed creator, address indexed signer);
    event OracleProofSubmitted(address indexed creator, address indexed oracle);
    event IntentTriggered(address indexed creator, uint256 timestamp, TriggerType triggerType);
    event OracleRegistrySet(address indexed oldRegistry, address indexed newRegistry);
    event OracleVerificationRequested(
        address indexed creator,
        bytes32 indexed aggregationId,
        IOracle.EventType eventType
    );
    event OracleVerificationCompleted(
        address indexed creator,
        bool isValid,
        uint256 confidenceScore
    );
    event ZKVerifierSet(address indexed oldVerifier, address indexed newVerifier);
    event ZKVerificationRequested(
        address indexed creator,
        bytes32 indexed requestId,
        bytes32 indexed keyId
    );
    event ZKVerificationCompleted(
        address indexed creator,
        bool isValid
    );

    constructor(address _intentModuleAddress) Ownable(msg.sender) {
        intentModule = IIntentCaptureModule(_intentModuleAddress);
    }

    /**
     * @dev Set the OracleRegistry contract address
     * @param _registry Address of the OracleRegistry contract
     */
    function setOracleRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Invalid registry address");
        address oldRegistry = address(oracleRegistry);
        oracleRegistry = OracleRegistry(_registry);
        emit OracleRegistrySet(oldRegistry, _registry);
    }

    /**
     * @dev Set the ZKVerifierAdapter contract address
     * @param _verifier Address of the ZKVerifierAdapter contract
     */
    function setZKVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        address oldVerifier = address(zkVerifier);
        zkVerifier = ZKVerifierAdapter(_verifier);
        emit ZKVerifierSet(oldVerifier, _verifier);
    }

    /**
     * @dev Configures a deadman switch trigger
     * @param _interval Seconds of inactivity before trigger activates
     */
    function configureDeadmanSwitch(uint256 _interval) external {
        require(_interval >= 30 days, "Interval must be at least 30 days");
        require(!triggers[msg.sender].isTriggered, "Already triggered");

        triggers[msg.sender] = TriggerConfig({
            triggerType: TriggerType.DeadmanSwitch,
            deadmanInterval: _interval,
            lastCheckIn: block.timestamp,
            trustedSigners: new address[](0),
            requiredSignatures: 0,
            oracles: new address[](0),
            isConfigured: true,
            isTriggered: false
        });

        emit TriggerConfigured(msg.sender, TriggerType.DeadmanSwitch);
    }

    /**
     * @dev Configures a trusted-signature quorum trigger
     * @param _signers Array of trusted signer addresses
     * @param _requiredSignatures Number of signatures needed to trigger
     */
    function configureTrustedQuorum(
        address[] memory _signers,
        uint256 _requiredSignatures
    ) external {
        require(_signers.length >= _requiredSignatures, "Not enough signers");
        require(_requiredSignatures >= 2, "Must require at least 2 signatures");
        require(_signers.length <= MAX_TRUSTED_SIGNERS, "Too many signers");
        require(!triggers[msg.sender].isTriggered, "Already triggered");

        triggers[msg.sender] = TriggerConfig({
            triggerType: TriggerType.TrustedQuorum,
            deadmanInterval: 0,
            lastCheckIn: 0,
            trustedSigners: _signers,
            requiredSignatures: _requiredSignatures,
            oracles: new address[](0),
            isConfigured: true,
            isTriggered: false
        });

        emit TriggerConfigured(msg.sender, TriggerType.TrustedQuorum);
    }

    /**
     * @dev Configures oracle-verified trigger (legacy direct mode)
     * @param _oracles Array of trusted oracle addresses
     */
    function configureOracleVerified(address[] memory _oracles) external {
        require(_oracles.length > 0, "Must specify at least one oracle");
        require(_oracles.length <= MAX_ORACLES, "Too many oracles");
        require(!triggers[msg.sender].isTriggered, "Already triggered");

        triggers[msg.sender] = TriggerConfig({
            triggerType: TriggerType.OracleVerified,
            deadmanInterval: 0,
            lastCheckIn: 0,
            trustedSigners: new address[](0),
            requiredSignatures: 0,
            oracles: _oracles,
            isConfigured: true,
            isTriggered: false
        });

        // Set default oracle config for legacy mode
        oracleConfigs[msg.sender] = OracleConfig({
            mode: OracleMode.Direct,
            eventType: IOracle.EventType.Death,
            dataHash: bytes32(0),
            aggregationId: bytes32(0),
            zkRequestId: bytes32(0),
            zkKeyId: bytes32(0),
            requiredConfidence: MIN_CONFIDENCE_THRESHOLD,
            useRegistry: false
        });

        emit TriggerConfigured(msg.sender, TriggerType.OracleVerified);
    }

    /**
     * @dev Configures enhanced oracle-verified trigger using OracleRegistry
     * @param _eventType Type of event to verify (Death, Incapacitation, LegalEvent, Custom)
     * @param _dataHash Hash of verification data (stored off-chain for privacy)
     * @param _requiredOracles Number of oracles required for consensus (0 = use registry default)
     */
    function configureEnhancedOracleVerified(
        IOracle.EventType _eventType,
        bytes32 _dataHash,
        uint256 _requiredOracles
    ) external {
        require(address(oracleRegistry) != address(0), "Oracle registry not set");
        require(!triggers[msg.sender].isTriggered, "Already triggered");
        require(_dataHash != bytes32(0), "Data hash required");

        triggers[msg.sender] = TriggerConfig({
            triggerType: TriggerType.OracleVerified,
            deadmanInterval: 0,
            lastCheckIn: 0,
            trustedSigners: new address[](0),
            requiredSignatures: 0,
            oracles: new address[](0),
            isConfigured: true,
            isTriggered: false
        });

        oracleConfigs[msg.sender] = OracleConfig({
            mode: OracleMode.Registry,
            eventType: _eventType,
            dataHash: _dataHash,
            aggregationId: bytes32(0),
            zkRequestId: bytes32(0),
            zkKeyId: bytes32(0),
            requiredConfidence: MIN_CONFIDENCE_THRESHOLD,
            useRegistry: true
        });

        emit TriggerConfigured(msg.sender, TriggerType.OracleVerified);
    }

    /**
     * @dev Request verification through OracleRegistry (for Registry mode)
     * @param _requiredOracles Number of oracles required (0 = use default)
     * @return aggregationId The aggregation ID for tracking
     */
    function requestOracleVerification(uint256 _requiredOracles)
        external
        nonReentrant
        returns (bytes32 aggregationId)
    {
        TriggerConfig storage config = triggers[msg.sender];
        OracleConfig storage oracleConfig = oracleConfigs[msg.sender];

        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.OracleVerified, "Not an oracle trigger");
        require(!config.isTriggered, "Already triggered");
        require(oracleConfig.useRegistry, "Not using registry mode");
        require(oracleConfig.aggregationId == bytes32(0), "Verification already requested");

        aggregationId = oracleRegistry.requestAggregatedVerification(
            msg.sender,
            oracleConfig.eventType,
            oracleConfig.dataHash,
            _requiredOracles
        );

        oracleConfig.aggregationId = aggregationId;

        emit OracleVerificationRequested(msg.sender, aggregationId, oracleConfig.eventType);

        return aggregationId;
    }

    /**
     * @dev Complete trigger based on OracleRegistry aggregation result
     * @param _creator Address of the intent creator
     */
    function completeOracleVerification(address _creator) external nonReentrant {
        TriggerConfig storage config = triggers[_creator];
        OracleConfig storage oracleConfig = oracleConfigs[_creator];

        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.OracleVerified, "Not an oracle trigger");
        require(!config.isTriggered, "Already triggered");
        require(oracleConfig.useRegistry, "Not using registry mode");
        require(oracleConfig.aggregationId != bytes32(0), "No verification requested");

        // Check if aggregation is complete and valid
        bool isValid = oracleRegistry.isAggregationValid(oracleConfig.aggregationId);

        OracleRegistry.AggregatedVerification memory agg =
            oracleRegistry.getAggregation(oracleConfig.aggregationId);

        emit OracleVerificationCompleted(_creator, isValid, agg.averageConfidence);

        require(isValid, "Oracle verification not valid");
        require(agg.averageConfidence >= oracleConfig.requiredConfidence, "Confidence too low");

        _executeTrigger(_creator, config);
    }

    // =============================================================================
    // ZK PROOF VERIFICATION FUNCTIONS
    // =============================================================================

    /**
     * @dev Configures ZK proof verified trigger
     * @param _eventType Type of event to verify (Death, Incapacitation, LegalEvent, Custom)
     * @param _dataHash Hash of verification data (certificate hash)
     * @param _zkKeyId Verification key ID to use for ZK proof verification
     */
    function configureZKProofVerified(
        IOracle.EventType _eventType,
        bytes32 _dataHash,
        bytes32 _zkKeyId
    ) external {
        require(address(zkVerifier) != address(0), "ZK verifier not set");
        require(!triggers[msg.sender].isTriggered, "Already triggered");
        require(_dataHash != bytes32(0), "Data hash required");
        require(_zkKeyId != bytes32(0), "ZK key ID required");
        require(zkVerifier.isKeyActive(_zkKeyId), "ZK key not active");

        triggers[msg.sender] = TriggerConfig({
            triggerType: TriggerType.OracleVerified,
            deadmanInterval: 0,
            lastCheckIn: 0,
            trustedSigners: new address[](0),
            requiredSignatures: 0,
            oracles: new address[](0),
            isConfigured: true,
            isTriggered: false
        });

        oracleConfigs[msg.sender] = OracleConfig({
            mode: OracleMode.ZKProof,
            eventType: _eventType,
            dataHash: _dataHash,
            aggregationId: bytes32(0),
            zkRequestId: bytes32(0),
            zkKeyId: _zkKeyId,
            requiredConfidence: MIN_CONFIDENCE_THRESHOLD,
            useRegistry: false
        });

        emit TriggerConfigured(msg.sender, TriggerType.OracleVerified);
    }

    /**
     * @dev Request ZK proof verification through ZKVerifierAdapter
     * @return requestId The request ID for tracking
     */
    function requestZKVerification() external nonReentrant returns (bytes32 requestId) {
        TriggerConfig storage config = triggers[msg.sender];
        OracleConfig storage oracleConfig = oracleConfigs[msg.sender];

        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.OracleVerified, "Not an oracle trigger");
        require(!config.isTriggered, "Already triggered");
        require(oracleConfig.mode == OracleMode.ZKProof, "Not using ZK proof mode");
        require(oracleConfig.zkRequestId == bytes32(0), "Verification already requested");

        requestId = zkVerifier.requestVerification(
            msg.sender,
            oracleConfig.eventType,
            oracleConfig.dataHash
        );

        oracleConfig.zkRequestId = requestId;

        emit ZKVerificationRequested(msg.sender, requestId, oracleConfig.zkKeyId);

        return requestId;
    }

    /**
     * @dev Complete trigger based on ZK proof verification result
     * @param _creator Address of the intent creator
     * @notice This should be called after a ZK proof has been submitted and verified
     */
    function completeZKVerification(address _creator) external nonReentrant {
        TriggerConfig storage config = triggers[_creator];
        OracleConfig storage oracleConfig = oracleConfigs[_creator];

        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.OracleVerified, "Not an oracle trigger");
        require(!config.isTriggered, "Already triggered");
        require(oracleConfig.mode == OracleMode.ZKProof, "Not using ZK proof mode");
        require(oracleConfig.zkRequestId != bytes32(0), "No verification requested");

        // Check if ZK verification is valid
        bool isValid = zkVerifier.isVerificationValid(oracleConfig.zkRequestId);

        emit ZKVerificationCompleted(_creator, isValid);

        require(isValid, "ZK verification not valid");

        _executeTrigger(_creator, config);
    }

    /**
     * @dev Get ZK verification status for a creator
     * @return requestId The ZK request ID (bytes32(0) if not using ZK mode)
     * @return keyId The ZK verification key ID
     * @return isComplete Whether verification is complete
     * @return isValid Whether verification is valid
     */
    function getZKVerificationStatus(address _creator)
        external
        view
        returns (
            bytes32 requestId,
            bytes32 keyId,
            bool isComplete,
            bool isValid
        )
    {
        OracleConfig memory oracleConfig = oracleConfigs[_creator];

        if (oracleConfig.mode != OracleMode.ZKProof || oracleConfig.zkRequestId == bytes32(0)) {
            return (bytes32(0), bytes32(0), false, false);
        }

        IOracle.VerificationRequest memory request = zkVerifier.getVerificationStatus(oracleConfig.zkRequestId);

        return (
            oracleConfig.zkRequestId,
            oracleConfig.zkKeyId,
            request.status != IOracle.VerificationStatus.Pending,
            request.status == IOracle.VerificationStatus.Verified && request.confidenceScore >= MIN_CONFIDENCE_THRESHOLD
        );
    }

    // =============================================================================
    // DEADMAN SWITCH FUNCTIONS
    // =============================================================================

    /**
     * @dev Check in to reset deadman switch timer
     */
    function checkIn() external {
        require(triggers[msg.sender].isConfigured, "Trigger not configured");
        require(triggers[msg.sender].triggerType == TriggerType.DeadmanSwitch, "Not a deadman switch");
        require(!triggers[msg.sender].isTriggered, "Already triggered");

        triggers[msg.sender].lastCheckIn = block.timestamp;
        emit DeadmanCheckIn(msg.sender, block.timestamp);
    }

    /**
     * @dev Execute deadman switch if interval has passed
     * @param _creator Address of the intent creator
     */
    function executeDeadmanSwitch(address _creator) external {
        TriggerConfig storage config = triggers[_creator];
        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.DeadmanSwitch, "Not a deadman switch");
        require(!config.isTriggered, "Already triggered");
        require(
            block.timestamp >= config.lastCheckIn + config.deadmanInterval,
            "Deadman interval not elapsed"
        );

        _executeTrigger(_creator, config);
    }

    /**
     * @dev Submit trusted signature for quorum trigger
     * @param _creator Address of the intent creator
     */
    function submitTrustedSignature(address _creator) external {
        TriggerConfig storage config = triggers[_creator];
        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.TrustedQuorum, "Not a quorum trigger");
        require(!config.isTriggered, "Already triggered");
        require(_isTrustedSigner(_creator, msg.sender), "Not a trusted signer");
        require(!hasSignedTrigger[_creator][msg.sender], "Already signed");

        hasSignedTrigger[_creator][msg.sender] = true;
        signatureCount[_creator]++;

        emit TrustedSignatureReceived(_creator, msg.sender);

        if (signatureCount[_creator] >= config.requiredSignatures) {
            _executeTrigger(_creator, config);
        }
    }

    /**
     * @dev Submit oracle proof for trigger (LEGACY DIRECT MODE)
     * @param _creator Address of the intent creator
     * @param _proof Zero-knowledge proof or verification data
     *
     * @notice DEPRECATION WARNING: This function uses direct oracle trust without
     * cryptographic proof verification. For production use, prefer OracleRegistry
     * with multi-oracle consensus or ZKVerifierAdapter with on-chain proof verification.
     * Direct mode trusts any registered oracle address unconditionally.
     *
     * Proof data is required but NOT cryptographically verified in this mode.
     * A non-empty proof is required to prevent accidental empty-data triggers.
     */
    function submitOracleProof(address _creator, bytes memory _proof) external {
        TriggerConfig storage config = triggers[_creator];
        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.OracleVerified, "Not an oracle trigger");
        require(!config.isTriggered, "Already triggered");
        require(_isOracle(_creator, msg.sender), "Not an authorized oracle");
        require(_proof.length > 0, "Proof data required");

        // WARNING: Proof is NOT cryptographically verified in direct oracle mode.
        // This mode trusts registered oracle addresses unconditionally.
        // For production, use OracleRegistry (multi-oracle consensus) or
        // ZKVerifierAdapter (on-chain ZK proof verification) instead.
        emit OracleProofSubmitted(_creator, msg.sender);

        _executeTrigger(_creator, config);
    }

    /**
     * @dev Internal function to execute trigger
     * @notice Follows checks-effects-interactions pattern
     */
    function _executeTrigger(address _creator, TriggerConfig storage config) internal {
        // Effects first
        config.isTriggered = true;

        // Emit event before external call
        emit IntentTriggered(_creator, block.timestamp, config.triggerType);

        // External interaction last
        intentModule.triggerIntent(_creator);
    }

    /**
     * @dev Check if address is a trusted signer
     */
    function _isTrustedSigner(address _creator, address _signer) internal view returns (bool) {
        address[] memory signers = triggers[_creator].trustedSigners;
        for (uint i = 0; i < signers.length; i++) {
            if (signers[i] == _signer) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Check if address is an authorized oracle
     */
    function _isOracle(address _creator, address _oracle) internal view returns (bool) {
        address[] memory oracles = triggers[_creator].oracles;
        for (uint i = 0; i < oracles.length; i++) {
            if (oracles[i] == _oracle) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get trigger configuration for a creator
     */
    function getTriggerConfig(address _creator) external view returns (TriggerConfig memory) {
        return triggers[_creator];
    }

    /**
     * @dev Get oracle configuration for a creator
     */
    function getOracleConfig(address _creator) external view returns (OracleConfig memory) {
        return oracleConfigs[_creator];
    }

    /**
     * @dev Check if oracle verification is pending
     */
    function isVerificationPending(address _creator) external view returns (bool) {
        OracleConfig memory oracleConfig = oracleConfigs[_creator];
        if (!oracleConfig.useRegistry || oracleConfig.aggregationId == bytes32(0)) {
            return false;
        }
        OracleRegistry.AggregatedVerification memory agg =
            oracleRegistry.getAggregation(oracleConfig.aggregationId);
        return !agg.isComplete;
    }

    /**
     * @dev Get verification status for a creator
     * @return aggregationId The aggregation ID (bytes32(0) if not using registry)
     * @return isComplete Whether verification is complete
     * @return isValid Whether verification is valid
     * @return confidence Average confidence score
     */
    function getVerificationStatus(address _creator)
        external
        view
        returns (
            bytes32 aggregationId,
            bool isComplete,
            bool isValid,
            uint256 confidence
        )
    {
        OracleConfig memory oracleConfig = oracleConfigs[_creator];

        if (!oracleConfig.useRegistry || oracleConfig.aggregationId == bytes32(0)) {
            return (bytes32(0), false, false, 0);
        }

        OracleRegistry.AggregatedVerification memory agg =
            oracleRegistry.getAggregation(oracleConfig.aggregationId);

        return (
            oracleConfig.aggregationId,
            agg.isComplete,
            agg.isValid,
            agg.averageConfidence
        );
    }
}

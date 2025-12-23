// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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
 */
contract TriggerMechanism is Ownable {
    using ECDSA for bytes32;

    enum TriggerType {
        DeadmanSwitch,
        TrustedQuorum,
        OracleVerified
    }

    struct TriggerConfig {
        TriggerType triggerType;
        uint256 deadmanInterval;     // For deadman: seconds of inactivity before trigger
        uint256 lastCheckIn;          // Last time creator checked in
        address[] trustedSigners;     // For quorum: trusted addresses
        uint256 requiredSignatures;   // Number of signatures needed
        address[] oracles;            // For oracle: verified oracle addresses
        bool isConfigured;
        bool isTriggered;
    }

    IIntentCaptureModule public intentModule;
    mapping(address => TriggerConfig) public triggers;
    mapping(address => mapping(address => bool)) public hasSignedTrigger;
    mapping(address => uint256) public signatureCount;

    event TriggerConfigured(address indexed creator, TriggerType triggerType);
    event DeadmanCheckIn(address indexed creator, uint256 timestamp);
    event TrustedSignatureReceived(address indexed creator, address indexed signer);
    event OracleProofSubmitted(address indexed creator, address indexed oracle);
    event IntentTriggered(address indexed creator, uint256 timestamp, TriggerType triggerType);

    constructor(address _intentModuleAddress) Ownable(msg.sender) {
        intentModule = IIntentCaptureModule(_intentModuleAddress);
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
     * @dev Configures oracle-verified trigger
     * @param _oracles Array of trusted oracle addresses
     */
    function configureOracleVerified(address[] memory _oracles) external {
        require(_oracles.length > 0, "Must specify at least one oracle");
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

        emit TriggerConfigured(msg.sender, TriggerType.OracleVerified);
    }

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
     * @dev Submit oracle proof for trigger
     * @param _creator Address of the intent creator
     * @param _proof Zero-knowledge proof or verification data
     */
    function submitOracleProof(address _creator, bytes memory _proof) external {
        TriggerConfig storage config = triggers[_creator];
        require(config.isConfigured, "Trigger not configured");
        require(config.triggerType == TriggerType.OracleVerified, "Not an oracle trigger");
        require(!config.isTriggered, "Already triggered");
        require(_isOracle(_creator, msg.sender), "Not an authorized oracle");

        // In production, verify the zero-knowledge proof here
        // For now, we trust the oracle
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
}

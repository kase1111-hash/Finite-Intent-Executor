// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title IntentCaptureModule
 * @dev Captures assets, goals, constraints, and time-boxed contextual corpus
 * Outputs immutable intent graph with cryptographic commitments
 */
contract IntentCaptureModule is Ownable {
    using ECDSA for bytes32;

    struct IntentGraph {
        bytes32 intentHash;          // Cryptographic hash of the intent
        bytes32 corpusHash;          // Hash of the contextual corpus (5-10 year window)
        string corpusURI;            // Decentralized storage URI for corpus
        string assetsURI;            // URI for tokenized assets
        uint256 captureTimestamp;    // When intent was captured
        uint256 corpusStartYear;     // Start of contextual window
        uint256 corpusEndYear;       // End of contextual window
        address[] assetAddresses;    // Addresses of tokenized assets
        bool isRevoked;              // Can be revoked while creator is alive
        bool isTriggered;            // Has execution been triggered
    }

    struct Goal {
        string description;
        bytes32 constraintsHash;
        uint256 priority;            // 1-100, higher is more important
    }

    mapping(address => IntentGraph) public intents;
    mapping(address => Goal[]) public goals;
    mapping(address => mapping(bytes32 => bool)) public signedVersions;

    // Address of the TriggerMechanism contract that can trigger intents
    address public triggerMechanism;

    event IntentCaptured(
        address indexed creator,
        bytes32 intentHash,
        bytes32 corpusHash,
        uint256 captureTimestamp
    );
    event IntentRevoked(address indexed creator, uint256 revokeTimestamp);
    event IntentTriggered(address indexed creator, uint256 triggerTimestamp);
    event GoalAdded(address indexed creator, string description, uint256 priority);
    event TriggerMechanismSet(address indexed oldMechanism, address indexed newMechanism);

    modifier notTriggered() {
        require(!intents[msg.sender].isTriggered, "Intent already triggered");
        _;
    }

    modifier notRevoked() {
        require(!intents[msg.sender].isRevoked, "Intent has been revoked");
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Captures the creator's intent with cryptographic commitments
     * @param _intentHash Hash of the complete intent document
     * @param _corpusHash Hash of the contextual corpus
     * @param _corpusURI Decentralized storage URI for corpus
     * @param _assetsURI URI for asset metadata
     * @param _corpusStartYear Start year of contextual window
     * @param _corpusEndYear End year of contextual window
     * @param _assetAddresses Addresses of tokenized assets under control
     */
    function captureIntent(
        bytes32 _intentHash,
        bytes32 _corpusHash,
        string memory _corpusURI,
        string memory _assetsURI,
        uint256 _corpusStartYear,
        uint256 _corpusEndYear,
        address[] memory _assetAddresses
    ) external notTriggered notRevoked {
        require(_corpusEndYear > _corpusStartYear, "Invalid corpus window");
        require(_corpusEndYear - _corpusStartYear >= 5 && _corpusEndYear - _corpusStartYear <= 10,
                "Corpus window must be 5-10 years");
        require(_assetAddresses.length > 0, "Must specify at least one asset");

        intents[msg.sender] = IntentGraph({
            intentHash: _intentHash,
            corpusHash: _corpusHash,
            corpusURI: _corpusURI,
            assetsURI: _assetsURI,
            captureTimestamp: block.timestamp,
            corpusStartYear: _corpusStartYear,
            corpusEndYear: _corpusEndYear,
            assetAddresses: _assetAddresses,
            isRevoked: false,
            isTriggered: false
        });

        emit IntentCaptured(msg.sender, _intentHash, _corpusHash, block.timestamp);
    }

    /**
     * @dev Adds a goal to the intent
     * @param _description Human-readable goal description
     * @param _constraintsHash Hash of constraints for this goal
     * @param _priority Priority level (1-100)
     */
    function addGoal(
        string memory _description,
        bytes32 _constraintsHash,
        uint256 _priority
    ) external notTriggered notRevoked {
        require(intents[msg.sender].intentHash != bytes32(0), "Intent not captured");
        require(_priority >= 1 && _priority <= 100, "Priority must be 1-100");

        goals[msg.sender].push(Goal({
            description: _description,
            constraintsHash: _constraintsHash,
            priority: _priority
        }));

        emit GoalAdded(msg.sender, _description, _priority);
    }

    /**
     * @dev Signs a specific version of the intent
     * @param _versionHash Hash of the intent version being signed
     */
    function signVersion(bytes32 _versionHash) external notTriggered notRevoked {
        require(intents[msg.sender].intentHash != bytes32(0), "Intent not captured");
        signedVersions[msg.sender][_versionHash] = true;
    }

    /**
     * @dev Revokes the intent (only possible while creator is alive)
     */
    function revokeIntent() external notTriggered {
        require(intents[msg.sender].intentHash != bytes32(0), "Intent not captured");
        intents[msg.sender].isRevoked = true;
        emit IntentRevoked(msg.sender, block.timestamp);
    }

    /**
     * @dev Sets the TriggerMechanism contract address (only owner)
     * @param _triggerMechanism Address of the TriggerMechanism contract
     */
    function setTriggerMechanism(address _triggerMechanism) external onlyOwner {
        require(_triggerMechanism != address(0), "Invalid address");
        address oldMechanism = triggerMechanism;
        triggerMechanism = _triggerMechanism;
        emit TriggerMechanismSet(oldMechanism, _triggerMechanism);
    }

    /**
     * @dev Marks intent as triggered (only callable by TriggerMechanism contract)
     * @param _creator Address of the intent creator
     */
    function triggerIntent(address _creator) external {
        require(msg.sender == triggerMechanism, "Only TriggerMechanism can trigger");
        require(!intents[_creator].isRevoked, "Intent has been revoked");
        require(intents[_creator].intentHash != bytes32(0), "Intent not captured");
        require(!intents[_creator].isTriggered, "Already triggered");

        intents[_creator].isTriggered = true;
        emit IntentTriggered(_creator, block.timestamp);
    }

    /**
     * @dev Returns the intent for a creator
     */
    function getIntent(address _creator) external view returns (IntentGraph memory) {
        return intents[_creator];
    }

    /**
     * @dev Returns all goals for a creator
     */
    function getGoals(address _creator) external view returns (Goal[] memory) {
        return goals[_creator];
    }

    /**
     * @dev Verifies if a version has been signed
     */
    function isVersionSigned(address _creator, bytes32 _versionHash) external view returns (bool) {
        return signedVersions[_creator][_versionHash];
    }
}

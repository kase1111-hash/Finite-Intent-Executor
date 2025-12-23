// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILexiconHolder {
    function resolveAmbiguity(
        address _creator,
        string memory _query,
        bytes32 _corpusHash
    ) external returns (string memory citation, uint256 confidence);
}

/**
 * @title ExecutionAgent
 * @dev Narrow, scope-bounded AI executor with strict interpretation rules
 * Capabilities: License assets, collect/distribute revenue, fund projects, enforce constraints
 * All ambiguous terms resolved via RAG against frozen contextual corpus
 * Defaults to inaction if confidence < 95%
 */
contract ExecutionAgent is AccessControl, ReentrancyGuard {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    uint256 public constant CONFIDENCE_THRESHOLD = 95; // 95% confidence required
    uint256 public constant SUNSET_DURATION = 20 * 365 days; // 20 years

    struct ExecutionRecord {
        address creator;
        string action;
        string corpusCitation;
        uint256 confidence;
        uint256 timestamp;
        bytes32 decisionHash;
    }

    struct License {
        address licensee;
        address assetAddress;
        uint256 royaltyPercentage; // Basis points (100 = 1%)
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    struct Project {
        string description;
        address recipient;
        uint256 fundingAmount;
        uint256 fundedAt;
        string corpusCitation;
    }

    ILexiconHolder public lexiconHolder;
    mapping(address => uint256) public triggerTimestamps;
    mapping(address => bool) public isSunset;
    mapping(address => ExecutionRecord[]) public executionLogs;
    mapping(address => License[]) public licenses;
    mapping(address => Project[]) public fundedProjects;
    mapping(address => uint256) public treasuries;

    // No political agency - prohibited activities
    mapping(bytes32 => bool) public prohibitedActions;

    event ActionExecuted(
        address indexed creator,
        string action,
        uint256 confidence,
        uint256 timestamp
    );
    event LicenseIssued(
        address indexed creator,
        address indexed licensee,
        address assetAddress,
        uint256 royaltyPercentage
    );
    event RevenueCollected(address indexed creator, uint256 amount);
    event RevenueDistributed(address indexed creator, address indexed recipient, uint256 amount);
    event ProjectFunded(address indexed creator, address indexed recipient, uint256 amount);
    event InactionDefault(address indexed creator, string reason, uint256 confidence);
    event SunsetActivated(address indexed creator, uint256 timestamp);

    constructor(address _lexiconHolderAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        lexiconHolder = ILexiconHolder(_lexiconHolderAddress);

        // Initialize prohibited actions (No Political Agency Clause)
        prohibitedActions[keccak256("electoral_activity")] = true;
        prohibitedActions[keccak256("political_advocacy")] = true;
        prohibitedActions[keccak256("lobbying")] = true;
        prohibitedActions[keccak256("policy_influence")] = true;
    }

    /**
     * @dev Activates execution for a triggered intent
     * @param _creator Address of the intent creator
     */
    function activateExecution(address _creator) external onlyRole(EXECUTOR_ROLE) {
        require(triggerTimestamps[_creator] == 0, "Already activated");
        triggerTimestamps[_creator] = block.timestamp;
    }

    /**
     * @dev Checks if execution is still active (not sunset)
     */
    function isExecutionActive(address _creator) public view returns (bool) {
        if (triggerTimestamps[_creator] == 0) return false;
        if (isSunset[_creator]) return false;
        return block.timestamp < triggerTimestamps[_creator] + SUNSET_DURATION;
    }

    /**
     * @dev Executes an action with corpus-based resolution
     * @param _creator Intent creator
     * @param _action Action to execute
     * @param _query Query for ambiguity resolution
     * @param _corpusHash Hash of the corpus to verify against
     */
    function executeAction(
        address _creator,
        string memory _action,
        string memory _query,
        bytes32 _corpusHash
    ) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        require(isExecutionActive(_creator), "Execution not active or sunset");
        require(!_isProhibitedAction(_action), "Action violates No Political Agency Clause");

        // Resolve ambiguity via lexicon holder
        (string memory citation, uint256 confidence) = lexiconHolder.resolveAmbiguity(
            _creator,
            _query,
            _corpusHash
        );

        // Ambiguity Resolution Failure Mode: default to inaction if confidence < 95%
        if (confidence < CONFIDENCE_THRESHOLD) {
            emit InactionDefault(_creator, "Confidence below threshold", confidence);
            return;
        }

        // Log decision on-chain with corpus citation
        ExecutionRecord memory record = ExecutionRecord({
            creator: _creator,
            action: _action,
            corpusCitation: citation,
            confidence: confidence,
            timestamp: block.timestamp,
            decisionHash: keccak256(abi.encodePacked(_action, citation, confidence))
        });

        executionLogs[_creator].push(record);
        emit ActionExecuted(_creator, _action, confidence, block.timestamp);
    }

    /**
     * @dev Issues a license for an asset
     * @param _creator Intent creator
     * @param _licensee Address receiving the license
     * @param _assetAddress Address of the asset being licensed
     * @param _royaltyPercentage Royalty in basis points
     * @param _duration Duration of the license in seconds
     * @param _corpusHash Corpus hash for verification
     */
    function issueLicense(
        address _creator,
        address _licensee,
        address _assetAddress,
        uint256 _royaltyPercentage,
        uint256 _duration,
        bytes32 _corpusHash
    ) external onlyRole(EXECUTOR_ROLE) {
        require(isExecutionActive(_creator), "Execution not active or sunset");
        require(_royaltyPercentage <= 10000, "Royalty cannot exceed 100%");

        // Verify this is aligned with intent via lexicon
        (string memory citation, uint256 confidence) = lexiconHolder.resolveAmbiguity(
            _creator,
            "license_issuance",
            _corpusHash
        );

        if (confidence < CONFIDENCE_THRESHOLD) {
            emit InactionDefault(_creator, "License issuance confidence too low", confidence);
            return;
        }

        License memory newLicense = License({
            licensee: _licensee,
            assetAddress: _assetAddress,
            royaltyPercentage: _royaltyPercentage,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            isActive: true
        });

        licenses[_creator].push(newLicense);
        emit LicenseIssued(_creator, _licensee, _assetAddress, _royaltyPercentage);
    }

    /**
     * @dev Funds an aligned project
     * @param _creator Intent creator
     * @param _recipient Project recipient
     * @param _amount Funding amount
     * @param _description Project description
     * @param _corpusHash Corpus hash for verification
     */
    function fundProject(
        address _creator,
        address _recipient,
        uint256 _amount,
        string memory _description,
        bytes32 _corpusHash
    ) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        require(isExecutionActive(_creator), "Execution not active or sunset");
        require(treasuries[_creator] >= _amount, "Insufficient treasury funds");

        // Verify project alignment with intent
        (string memory citation, uint256 confidence) = lexiconHolder.resolveAmbiguity(
            _creator,
            string(abi.encodePacked("fund_project:", _description)),
            _corpusHash
        );

        if (confidence < CONFIDENCE_THRESHOLD) {
            emit InactionDefault(_creator, "Project funding confidence too low", confidence);
            return;
        }

        // Effects first (state changes before external call)
        treasuries[_creator] -= _amount;

        Project memory project = Project({
            description: _description,
            recipient: _recipient,
            fundingAmount: _amount,
            fundedAt: block.timestamp,
            corpusCitation: citation
        });

        fundedProjects[_creator].push(project);
        emit ProjectFunded(_creator, _recipient, _amount);

        // External interaction last
        (bool success, ) = payable(_recipient).call{value: _amount}("");
        require(success, "Project funding transfer failed");
    }

    /**
     * @dev Deposits funds into creator's treasury
     */
    function depositToTreasury(address _creator) external payable {
        treasuries[_creator] += msg.value;
    }

    /**
     * @dev Distributes revenue according to intent
     * @param _creator Intent creator
     * @param _recipient Revenue recipient
     * @param _amount Amount to distribute
     */
    function distributeRevenue(
        address _creator,
        address _recipient,
        uint256 _amount
    ) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        require(isExecutionActive(_creator), "Execution not active or sunset");
        require(treasuries[_creator] >= _amount, "Insufficient treasury funds");

        // Effects first (state changes before external call)
        treasuries[_creator] -= _amount;
        emit RevenueDistributed(_creator, _recipient, _amount);

        // External interaction last
        (bool success, ) = payable(_recipient).call{value: _amount}("");
        require(success, "Revenue distribution failed");
    }

    /**
     * @dev Activates sunset protocol after 20 years
     * @param _creator Intent creator
     */
    function activateSunset(address _creator) external {
        require(triggerTimestamps[_creator] > 0, "Execution not started");
        require(
            block.timestamp >= triggerTimestamps[_creator] + SUNSET_DURATION,
            "Sunset duration not reached"
        );
        require(!isSunset[_creator], "Already sunset");

        isSunset[_creator] = true;
        emit SunsetActivated(_creator, block.timestamp);
    }

    /**
     * @dev Checks if an action is politically prohibited
     */
    function _isProhibitedAction(string memory _action) internal view returns (bool) {
        bytes32 actionHash = keccak256(abi.encodePacked(_action));
        return prohibitedActions[actionHash] ||
               _containsProhibitedKeyword(_action);
    }

    /**
     * @dev Checks for prohibited keywords in action
     */
    function _containsProhibitedKeyword(string memory _action) internal pure returns (bool) {
        bytes memory actionBytes = bytes(_action);
        // Simple keyword check - in production, use more sophisticated NLP
        return _contains(actionBytes, "electoral") ||
               _contains(actionBytes, "political") ||
               _contains(actionBytes, "lobbying") ||
               _contains(actionBytes, "policy");
    }

    /**
     * @dev Helper function to check if bytes contain a substring
     */
    function _contains(bytes memory _haystack, string memory _needle) internal pure returns (bool) {
        bytes memory needleBytes = bytes(_needle);
        if (needleBytes.length > _haystack.length) return false;

        for (uint i = 0; i <= _haystack.length - needleBytes.length; i++) {
            bool found = true;
            for (uint j = 0; j < needleBytes.length; j++) {
                if (_haystack[i + j] != needleBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    /**
     * @dev Get execution logs for a creator
     */
    function getExecutionLogs(address _creator) external view returns (ExecutionRecord[] memory) {
        return executionLogs[_creator];
    }

    /**
     * @dev Get licenses for a creator
     */
    function getLicenses(address _creator) external view returns (License[] memory) {
        return licenses[_creator];
    }

    /**
     * @dev Get funded projects for a creator
     */
    function getFundedProjects(address _creator) external view returns (Project[] memory) {
        return fundedProjects[_creator];
    }
}

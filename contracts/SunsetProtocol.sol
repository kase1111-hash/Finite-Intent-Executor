// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IExecutionAgent {
    function activateSunset(address _creator) external;
    function isSunset(address _creator) external view returns (bool);
}

interface ILexiconHolder {
    function assignLegacyToCluster(address _creator, bytes32 _clusterId) external;
}

/**
 * @title SunsetProtocol
 * @dev Manages mandatory termination after 20 years
 * Halts execution, migrates assets to decentralized storage
 * Transitions IP to public-domain-equivalent licensing
 * Automated clustering for cultural remix and discoverability
 */
contract SunsetProtocol is AccessControl {
    bytes32 public constant SUNSET_OPERATOR_ROLE = keccak256("SUNSET_OPERATOR_ROLE");

    uint256 public constant SUNSET_DURATION = 20 * 365 days; // 20 years, non-configurable

    enum LicenseType {
        CC0,                    // Creative Commons Zero
        PublicDomain,          // Public Domain Equivalent
        NeutralStewardship     // Neutral stewardship, no exclusive re-enclosure
    }

    struct SunsetState {
        address creator;
        uint256 triggerTimestamp;
        uint256 sunsetTimestamp;
        bool isSunset;
        bool assetsArchived;
        bool ipTransitioned;
        bool clustered;
        LicenseType postSunsetLicense;
        string archiveURI;
    }

    struct AssetArchive {
        address assetAddress;
        string storageURI;
        bytes32 assetHash;
        uint256 archivedAt;
    }

    IExecutionAgent public executionAgent;
    ILexiconHolder public lexiconHolder;

    mapping(address => SunsetState) public sunsetStates;
    mapping(address => AssetArchive[]) public archivedAssets;
    mapping(address => mapping(address => bool)) public assetTransitioned;

    event SunsetInitiated(address indexed creator, uint256 sunsetTimestamp);
    event ExecutionHalted(address indexed creator, uint256 timestamp);
    event AssetsArchived(address indexed creator, uint256 assetCount, string archiveURI);
    event IPTransitioned(
        address indexed creator,
        LicenseType licenseType,
        uint256 timestamp
    );
    event LegacyClustered(address indexed creator, bytes32 clusterId);
    event SunsetCompleted(address indexed creator, uint256 timestamp);

    constructor(address _executionAgentAddress, address _lexiconHolderAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SUNSET_OPERATOR_ROLE, msg.sender);
        executionAgent = IExecutionAgent(_executionAgentAddress);
        lexiconHolder = ILexiconHolder(_lexiconHolderAddress);
    }

    /**
     * @dev Initiates sunset protocol when 20 years have passed
     * @param _creator Address of the intent creator
     * @param _triggerTimestamp When execution was triggered
     */
    function initiateSunset(
        address _creator,
        uint256 _triggerTimestamp
    ) external onlyRole(SUNSET_OPERATOR_ROLE) {
        require(_triggerTimestamp > 0, "Invalid trigger timestamp");
        require(
            block.timestamp >= _triggerTimestamp + SUNSET_DURATION,
            "20 year duration not elapsed"
        );
        require(!sunsetStates[_creator].isSunset, "Sunset already initiated");

        sunsetStates[_creator] = SunsetState({
            creator: _creator,
            triggerTimestamp: _triggerTimestamp,
            sunsetTimestamp: block.timestamp,
            isSunset: true,
            assetsArchived: false,
            ipTransitioned: false,
            clustered: false,
            postSunsetLicense: LicenseType.CC0,
            archiveURI: ""
        });

        // Halt execution via ExecutionAgent
        executionAgent.activateSunset(_creator);

        emit SunsetInitiated(_creator, block.timestamp);
        emit ExecutionHalted(_creator, block.timestamp);
    }

    /**
     * @dev Archives assets to permanent decentralized storage
     * @param _creator Intent creator
     * @param _assetAddresses Addresses of assets to archive
     * @param _storageURIs Decentralized storage URIs for each asset
     * @param _assetHashes Cryptographic hashes of assets
     */
    function archiveAssets(
        address _creator,
        address[] memory _assetAddresses,
        string[] memory _storageURIs,
        bytes32[] memory _assetHashes
    ) external onlyRole(SUNSET_OPERATOR_ROLE) {
        require(sunsetStates[_creator].isSunset, "Sunset not initiated");
        require(!sunsetStates[_creator].assetsArchived, "Assets already archived");
        require(
            _assetAddresses.length == _storageURIs.length &&
            _assetAddresses.length == _assetHashes.length,
            "Array length mismatch"
        );

        for (uint i = 0; i < _assetAddresses.length; i++) {
            AssetArchive memory archive = AssetArchive({
                assetAddress: _assetAddresses[i],
                storageURI: _storageURIs[i],
                assetHash: _assetHashes[i],
                archivedAt: block.timestamp
            });

            archivedAssets[_creator].push(archive);
        }

        sunsetStates[_creator].assetsArchived = true;
        sunsetStates[_creator].archiveURI = _buildArchiveURI(_creator);

        emit AssetsArchived(_creator, _assetAddresses.length, sunsetStates[_creator].archiveURI);
    }

    /**
     * @dev Transitions IP assets to public-domain-equivalent licensing
     * @param _creator Intent creator
     * @param _licenseType Type of public license to apply
     */
    function transitionIP(
        address _creator,
        LicenseType _licenseType
    ) external onlyRole(SUNSET_OPERATOR_ROLE) {
        require(sunsetStates[_creator].isSunset, "Sunset not initiated");
        require(sunsetStates[_creator].assetsArchived, "Assets not archived");
        require(!sunsetStates[_creator].ipTransitioned, "IP already transitioned");

        sunsetStates[_creator].postSunsetLicense = _licenseType;
        sunsetStates[_creator].ipTransitioned = true;

        emit IPTransitioned(_creator, _licenseType, block.timestamp);
    }

    /**
     * @dev Clusters legacy with semantically similar archived intents
     * @param _creator Intent creator
     * @param _clusterId Cluster identifier from lexicon holder
     */
    function clusterLegacy(
        address _creator,
        bytes32 _clusterId
    ) external onlyRole(SUNSET_OPERATOR_ROLE) {
        require(sunsetStates[_creator].isSunset, "Sunset not initiated");
        require(sunsetStates[_creator].ipTransitioned, "IP not transitioned");
        require(!sunsetStates[_creator].clustered, "Already clustered");

        // Assign to cluster via lexicon holder
        lexiconHolder.assignLegacyToCluster(_creator, _clusterId);

        sunsetStates[_creator].clustered = true;

        emit LegacyClustered(_creator, _clusterId);
    }

    /**
     * @dev Completes sunset protocol
     * @param _creator Intent creator
     */
    function completeSunset(address _creator) external onlyRole(SUNSET_OPERATOR_ROLE) {
        SunsetState storage state = sunsetStates[_creator];

        require(state.isSunset, "Sunset not initiated");
        require(state.assetsArchived, "Assets not archived");
        require(state.ipTransitioned, "IP not transitioned");
        require(state.clustered, "Legacy not clustered");

        emit SunsetCompleted(_creator, block.timestamp);
    }

    /**
     * @dev Checks if sunset is due for a creator
     * @param _creator Intent creator
     * @param _triggerTimestamp When execution was triggered
     */
    function isSunsetDue(
        address _creator,
        uint256 _triggerTimestamp
    ) external view returns (bool) {
        if (sunsetStates[_creator].isSunset) return false;
        if (_triggerTimestamp == 0) return false;
        return block.timestamp >= _triggerTimestamp + SUNSET_DURATION;
    }

    /**
     * @dev Gets archived assets for a creator
     */
    function getArchivedAssets(address _creator) external view returns (AssetArchive[] memory) {
        return archivedAssets[_creator];
    }

    /**
     * @dev Gets sunset state for a creator
     */
    function getSunsetState(address _creator) external view returns (SunsetState memory) {
        return sunsetStates[_creator];
    }

    /**
     * @dev Builds archive URI from creator address
     */
    function _buildArchiveURI(address _creator) internal pure returns (string memory) {
        // In production, this would construct a proper IPFS or Arweave URI
        return string(abi.encodePacked("ipfs://archive/", _addressToString(_creator)));
    }

    /**
     * @dev Converts address to string
     */
    function _addressToString(address _addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory data = abi.encodePacked(_addr);
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint(uint8(data[i] >> 4))];
            str[3 + i * 2] = alphabet[uint(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }

    /**
     * @dev Emergency function to force sunset after 20 years
     * Can be called by anyone if sunset is due but not initiated
     */
    function emergencySunset(address _creator, uint256 _triggerTimestamp) external {
        require(_triggerTimestamp > 0, "Invalid trigger timestamp");
        require(
            block.timestamp >= _triggerTimestamp + SUNSET_DURATION,
            "20 year duration not elapsed"
        );
        require(!sunsetStates[_creator].isSunset, "Sunset already initiated");

        sunsetStates[_creator] = SunsetState({
            creator: _creator,
            triggerTimestamp: _triggerTimestamp,
            sunsetTimestamp: block.timestamp,
            isSunset: true,
            assetsArchived: false,
            ipTransitioned: false,
            clustered: false,
            postSunsetLicense: LicenseType.CC0,
            archiveURI: ""
        });

        executionAgent.activateSunset(_creator);

        emit SunsetInitiated(_creator, block.timestamp);
        emit ExecutionHalted(_creator, block.timestamp);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IPToken
 * @dev ERC721 token for intellectual property assets
 * Supports licensing, royalty distribution, and post-sunset public domain transition
 */
contract IPToken is ERC721, ERC721URIStorage, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    /// @notice Maximum number of licenses per token to prevent DoS in loops
    uint256 public constant MAX_LICENSES_PER_TOKEN = 100;

    /// @notice Minimum license duration (1 day)
    uint256 public constant MIN_LICENSE_DURATION = 1 days;

    /// @notice Maximum license duration (20 years, aligned with sunset)
    uint256 public constant MAX_LICENSE_DURATION = 20 * 365 days;

    struct IPAsset {
        string title;
        string description;
        string ipType;           // "article", "code", "music", "art", etc.
        address creator;
        uint256 createdAt;
        bytes32 contentHash;     // Hash of the IP content
        bool isPublicDomain;     // Post-sunset state
        string licenseType;      // Current license type
    }

    struct RoyaltyInfo {
        address recipient;
        uint256 percentage;      // Basis points (100 = 1%)
    }

    struct License {
        address licensee;
        uint256 tokenId;
        uint256 royaltyPercentage;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        uint256 revenueGenerated;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => IPAsset) public ipAssets;
    mapping(uint256 => RoyaltyInfo) public royalties;
    mapping(uint256 => License[]) public licenses;
    mapping(address => uint256[]) public creatorTokens;

    event IPMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string title,
        string ipType
    );
    event LicenseGranted(
        uint256 indexed tokenId,
        address indexed licensee,
        uint256 royaltyPercentage,
        uint256 duration
    );
    event RoyaltyPaid(
        uint256 indexed tokenId,
        address indexed payer,
        address indexed recipient,
        uint256 amount
    );
    event TransitionedToPublicDomain(uint256 indexed tokenId, uint256 timestamp);
    event RevenueCollected(uint256 indexed tokenId, uint256 amount);

    constructor() ERC721("Finite Intent IP Token", "FIIPT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
    }

    /**
     * @dev Mints a new IP token
     * @param _to Address to mint to (usually the creator)
     * @param _title Title of the IP
     * @param _description Description
     * @param _ipType Type of IP (article, code, music, etc.)
     * @param _contentHash Hash of the content
     * @param _uri Metadata URI
     * @param _licenseType Initial license type
     */
    function mintIP(
        address _to,
        string memory _title,
        string memory _description,
        string memory _ipType,
        bytes32 _contentHash,
        string memory _uri,
        string memory _licenseType
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        _safeMint(_to, tokenId);
        _setTokenURI(tokenId, _uri);

        ipAssets[tokenId] = IPAsset({
            title: _title,
            description: _description,
            ipType: _ipType,
            creator: _to,
            createdAt: block.timestamp,
            contentHash: _contentHash,
            isPublicDomain: false,
            licenseType: _licenseType
        });

        // Set default royalty to creator at 10%
        royalties[tokenId] = RoyaltyInfo({
            recipient: _to,
            percentage: 1000  // 10% in basis points
        });

        creatorTokens[_to].push(tokenId);

        emit IPMinted(tokenId, _to, _title, _ipType);

        return tokenId;
    }

    /**
     * @dev Grants a license for an IP asset
     * @param _tokenId Token ID of the IP
     * @param _licensee Address receiving the license
     * @param _royaltyPercentage Royalty percentage in basis points
     * @param _duration Duration of license in seconds
     */
    function grantLicense(
        uint256 _tokenId,
        address _licensee,
        uint256 _royaltyPercentage,
        uint256 _duration
    ) external onlyRole(EXECUTOR_ROLE) {
        require(_ownerOf(_tokenId) != address(0), "Token does not exist");
        require(_royaltyPercentage <= 10000, "Royalty cannot exceed 100%");
        require(!ipAssets[_tokenId].isPublicDomain, "IP is in public domain");
        require(licenses[_tokenId].length < MAX_LICENSES_PER_TOKEN, "License limit reached");
        require(_duration >= MIN_LICENSE_DURATION, "License duration too short");
        require(_duration <= MAX_LICENSE_DURATION, "License duration too long");

        License memory newLicense = License({
            licensee: _licensee,
            tokenId: _tokenId,
            royaltyPercentage: _royaltyPercentage,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            isActive: true,
            revenueGenerated: 0
        });

        licenses[_tokenId].push(newLicense);

        emit LicenseGranted(_tokenId, _licensee, _royaltyPercentage, _duration);
    }

    /**
     * @dev Pays royalty for IP usage
     * @param _tokenId Token ID of the IP
     */
    function payRoyalty(uint256 _tokenId) external payable nonReentrant {
        require(_ownerOf(_tokenId) != address(0), "Token does not exist");
        require(msg.value > 0, "Must send payment");

        RoyaltyInfo memory royaltyInfo = royalties[_tokenId];
        address recipient = royaltyInfo.recipient;

        // Update revenue for active licenses FIRST (checks-effects-interactions)
        License[] storage tokenLicenses = licenses[_tokenId];
        uint256 iterLimit = tokenLicenses.length > MAX_LICENSES_PER_TOKEN
            ? MAX_LICENSES_PER_TOKEN
            : tokenLicenses.length;
        for (uint i = 0; i < iterLimit; i++) {
            if (
                tokenLicenses[i].isActive &&
                block.timestamp >= tokenLicenses[i].startTime &&
                block.timestamp <= tokenLicenses[i].endTime
            ) {
                tokenLicenses[i].revenueGenerated += msg.value;
            }
        }

        emit RoyaltyPaid(_tokenId, msg.sender, recipient, msg.value);
        emit RevenueCollected(_tokenId, msg.value);

        // Transfer royalty to recipient LAST (external call)
        (bool success, ) = payable(recipient).call{value: msg.value}("");
        require(success, "Royalty transfer failed");
    }

    /**
     * @dev Transitions IP to public domain (post-sunset)
     * @param _tokenId Token ID of the IP
     */
    function transitionToPublicDomain(uint256 _tokenId) external onlyRole(EXECUTOR_ROLE) {
        require(_ownerOf(_tokenId) != address(0), "Token does not exist");
        require(!ipAssets[_tokenId].isPublicDomain, "Already public domain");

        ipAssets[_tokenId].isPublicDomain = true;
        ipAssets[_tokenId].licenseType = "CC0";

        // Deactivate all licenses (bounded iteration)
        License[] storage tokenLicenses = licenses[_tokenId];
        uint256 iterLimit = tokenLicenses.length > MAX_LICENSES_PER_TOKEN
            ? MAX_LICENSES_PER_TOKEN
            : tokenLicenses.length;
        for (uint i = 0; i < iterLimit; i++) {
            tokenLicenses[i].isActive = false;
        }

        emit TransitionedToPublicDomain(_tokenId, block.timestamp);
    }

    /**
     * @dev Updates royalty information
     * @param _tokenId Token ID
     * @param _recipient New royalty recipient
     * @param _percentage New royalty percentage
     */
    function setRoyaltyInfo(
        uint256 _tokenId,
        address _recipient,
        uint256 _percentage
    ) external onlyRole(EXECUTOR_ROLE) {
        require(_ownerOf(_tokenId) != address(0), "Token does not exist");
        require(_percentage <= 10000, "Percentage cannot exceed 100%");

        royalties[_tokenId] = RoyaltyInfo({
            recipient: _recipient,
            percentage: _percentage
        });
    }

    /**
     * @dev Gets all tokens created by an address
     */
    function getCreatorTokens(address _creator) external view returns (uint256[] memory) {
        return creatorTokens[_creator];
    }

    /**
     * @dev Gets all licenses for a token
     */
    function getLicenses(uint256 _tokenId) external view returns (License[] memory) {
        return licenses[_tokenId];
    }

    /**
     * @dev Gets IP asset information
     */
    function getIPAsset(uint256 _tokenId) external view returns (IPAsset memory) {
        return ipAssets[_tokenId];
    }

    /**
     * @dev Gets royalty information for a token
     */
    function getRoyaltyInfo(uint256 _tokenId) external view returns (RoyaltyInfo memory) {
        return royalties[_tokenId];
    }

    /**
     * @dev Checks if a license is currently active
     */
    function isLicenseActive(uint256 _tokenId, uint256 _licenseIndex) external view returns (bool) {
        require(_licenseIndex < licenses[_tokenId].length, "Invalid license index");
        License memory license = licenses[_tokenId][_licenseIndex];

        return license.isActive &&
               block.timestamp >= license.startTime &&
               block.timestamp <= license.endTime;
    }

    // Override required functions
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

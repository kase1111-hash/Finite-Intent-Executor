// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title LexiconHolder
 * @dev Non-actuating semantic indexer for intent interpretation
 * No authority to initiate, modify, veto, or influence execution
 * Functions: (a) interpretive citations from frozen corpus, (b) post-sunset clustering
 */
contract LexiconHolder is AccessControl {
    bytes32 public constant INDEXER_ROLE = keccak256("INDEXER_ROLE");

    struct CorpusEntry {
        bytes32 corpusHash;
        string storageURI;
        uint256 startYear;
        uint256 endYear;
        bool isFrozen;
    }

    struct SemanticIndex {
        string keyword;
        string[] citations;
        uint256[] relevanceScores; // 0-100
    }

    struct EmbeddingCluster {
        bytes32 clusterId;
        address[] legacies;
        string description;
        uint256 createdAt;
    }

    mapping(address => CorpusEntry) public corpusRegistry;
    mapping(address => mapping(bytes32 => SemanticIndex)) public semanticIndices;
    mapping(bytes32 => EmbeddingCluster) public clusters;
    mapping(address => bytes32) public legacyClusterAssignments;

    event CorpusFrozen(address indexed creator, bytes32 corpusHash, uint256 timestamp);
    event SemanticIndexCreated(address indexed creator, string keyword);
    event AmbiguityResolved(
        address indexed creator,
        string query,
        string citation,
        uint256 confidence
    );
    event ClusterCreated(bytes32 indexed clusterId, string description);
    event LegacyAssigned(address indexed creator, bytes32 indexed clusterId);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(INDEXER_ROLE, msg.sender);
    }

    /**
     * @dev Registers and freezes a corpus for a creator
     * @param _creator Intent creator address
     * @param _corpusHash Cryptographic hash of the corpus
     * @param _storageURI Decentralized storage URI
     * @param _startYear Start of contextual window
     * @param _endYear End of contextual window
     */
    function freezeCorpus(
        address _creator,
        bytes32 _corpusHash,
        string memory _storageURI,
        uint256 _startYear,
        uint256 _endYear
    ) external onlyRole(INDEXER_ROLE) {
        require(!corpusRegistry[_creator].isFrozen, "Corpus already frozen");
        require(_endYear > _startYear, "Invalid time window");

        corpusRegistry[_creator] = CorpusEntry({
            corpusHash: _corpusHash,
            storageURI: _storageURI,
            startYear: _startYear,
            endYear: _endYear,
            isFrozen: true
        });

        emit CorpusFrozen(_creator, _corpusHash, block.timestamp);
    }

    /**
     * @dev Creates a semantic index for a keyword
     * @param _creator Intent creator
     * @param _keyword Keyword to index
     * @param _citations Array of citations from corpus
     * @param _relevanceScores Relevance scores (0-100) for each citation
     */
    function createSemanticIndex(
        address _creator,
        string memory _keyword,
        string[] memory _citations,
        uint256[] memory _relevanceScores
    ) external onlyRole(INDEXER_ROLE) {
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");
        require(_citations.length == _relevanceScores.length, "Array length mismatch");

        bytes32 indexKey = keccak256(abi.encodePacked(_keyword));

        semanticIndices[_creator][indexKey] = SemanticIndex({
            keyword: _keyword,
            citations: _citations,
            relevanceScores: _relevanceScores
        });

        emit SemanticIndexCreated(_creator, _keyword);
    }

    /**
     * @dev Resolves ambiguity by retrieving citations from frozen corpus
     * @param _creator Intent creator
     * @param _query Ambiguous term or query
     * @param _corpusHash Expected corpus hash for verification
     * @return citation Best matching citation
     * @return confidence Confidence score (0-100)
     */
    function resolveAmbiguity(
        address _creator,
        string memory _query,
        bytes32 _corpusHash
    ) external returns (string memory citation, uint256 confidence) {
        // Verify corpus hash matches
        require(
            corpusRegistry[_creator].corpusHash == _corpusHash,
            "Corpus hash mismatch"
        );
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");

        // Look up semantic index
        bytes32 queryHash = keccak256(abi.encodePacked(_query));
        SemanticIndex memory index = semanticIndices[_creator][queryHash];

        if (index.citations.length == 0) {
            return ("", 0);
        }

        // Find highest relevance citation
        uint256 maxScore = 0;
        uint256 maxIndex = 0;

        for (uint i = 0; i < index.relevanceScores.length; i++) {
            if (index.relevanceScores[i] > maxScore) {
                maxScore = index.relevanceScores[i];
                maxIndex = i;
            }
        }

        citation = index.citations[maxIndex];
        confidence = maxScore;

        emit AmbiguityResolved(_creator, _query, citation, confidence);
    }

    /**
     * @dev Creates an embedding cluster for post-sunset legacies
     * @param _clusterId Unique cluster identifier
     * @param _description Cluster description
     */
    function createCluster(
        bytes32 _clusterId,
        string memory _description
    ) external onlyRole(INDEXER_ROLE) {
        require(clusters[_clusterId].clusterId == bytes32(0), "Cluster already exists");

        clusters[_clusterId] = EmbeddingCluster({
            clusterId: _clusterId,
            legacies: new address[](0),
            description: _description,
            createdAt: block.timestamp
        });

        emit ClusterCreated(_clusterId, _description);
    }

    /**
     * @dev Assigns a legacy to a semantic cluster (post-sunset)
     * @param _creator Legacy creator address
     * @param _clusterId Cluster to assign to
     */
    function assignLegacyToCluster(
        address _creator,
        bytes32 _clusterId
    ) external onlyRole(INDEXER_ROLE) {
        require(clusters[_clusterId].clusterId != bytes32(0), "Cluster does not exist");
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");

        clusters[_clusterId].legacies.push(_creator);
        legacyClusterAssignments[_creator] = _clusterId;

        emit LegacyAssigned(_creator, _clusterId);
    }

    /**
     * @dev Retrieves corpus information
     */
    function getCorpus(address _creator) external view returns (CorpusEntry memory) {
        return corpusRegistry[_creator];
    }

    /**
     * @dev Retrieves semantic index for a keyword
     */
    function getSemanticIndex(
        address _creator,
        string memory _keyword
    ) external view returns (SemanticIndex memory) {
        bytes32 indexKey = keccak256(abi.encodePacked(_keyword));
        return semanticIndices[_creator][indexKey];
    }

    /**
     * @dev Retrieves cluster information
     */
    function getCluster(bytes32 _clusterId) external view returns (EmbeddingCluster memory) {
        return clusters[_clusterId];
    }

    /**
     * @dev Retrieves cluster assignment for a legacy
     */
    function getLegacyCluster(address _creator) external view returns (bytes32) {
        return legacyClusterAssignments[_creator];
    }

    /**
     * @dev Batch creates semantic indices for efficiency
     */
    function batchCreateIndices(
        address _creator,
        string[] memory _keywords,
        string[][] memory _citationsArray,
        uint256[][] memory _scoresArray
    ) external onlyRole(INDEXER_ROLE) {
        require(_keywords.length == _citationsArray.length, "Array length mismatch");
        require(_keywords.length == _scoresArray.length, "Array length mismatch");

        for (uint i = 0; i < _keywords.length; i++) {
            bytes32 indexKey = keccak256(abi.encodePacked(_keywords[i]));

            semanticIndices[_creator][indexKey] = SemanticIndex({
                keyword: _keywords[i],
                citations: _citationsArray[i],
                relevanceScores: _scoresArray[i]
            });

            emit SemanticIndexCreated(_creator, _keywords[i]);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title LexiconHolder
 * @dev Non-actuating semantic indexer for intent interpretation
 * No authority to initiate, modify, veto, or influence execution
 * Functions: (a) interpretive citations from frozen corpus, (b) post-sunset clustering
 *
 * Resolution architecture (Phase 4):
 * - Off-chain indexer service computes semantic embeddings from frozen corpus
 * - Indexer submits pre-computed resolution results via submitResolution()
 * - resolveAmbiguity() checks resolution cache first, falls back to exact-match index
 * - This enables meaningful confidence scores for semantically similar queries
 */
contract LexiconHolder is AccessControl {
    bytes32 public constant INDEXER_ROLE = keccak256("INDEXER_ROLE");

    /// @notice Maximum number of citations per semantic index to prevent DoS
    uint256 public constant MAX_CITATIONS_PER_INDEX = 100;

    /// @notice Maximum number of indices that can be created in a single batch
    uint256 public constant MAX_BATCH_SIZE = 50;

    /// @notice Maximum number of top-k results from a resolution
    uint256 public constant MAX_TOPK_RESULTS = 10;

    /// @notice Maximum queries in a single batch resolution
    uint256 public constant MAX_RESOLUTION_BATCH = 20;

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

    /// @notice Pre-computed semantic resolution result submitted by off-chain indexer
    struct ResolutionResult {
        string[] citations;
        uint256[] confidences; // 0-100
        uint256 resolvedAt;
    }

    mapping(address => CorpusEntry) public corpusRegistry;
    mapping(address => mapping(bytes32 => SemanticIndex)) public semanticIndices;
    mapping(bytes32 => EmbeddingCluster) public clusters;
    mapping(address => bytes32) public legacyClusterAssignments;

    /// @notice Resolution cache: creator => queryHash => pre-computed resolution
    mapping(address => mapping(bytes32 => ResolutionResult)) private resolutionCache;

    event CorpusFrozen(address indexed creator, bytes32 corpusHash, uint256 timestamp);
    event SemanticIndexCreated(address indexed creator, string keyword);
    event ClusterCreated(bytes32 indexed clusterId, string description);
    event LegacyAssigned(address indexed creator, bytes32 indexed clusterId);
    event ResolutionSubmitted(address indexed creator, string query, uint256 citationCount);

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
        require(_citations.length <= MAX_CITATIONS_PER_INDEX, "Too many citations");

        bytes32 indexKey = keccak256(abi.encodePacked(_keyword));

        semanticIndices[_creator][indexKey] = SemanticIndex({
            keyword: _keyword,
            citations: _citations,
            relevanceScores: _relevanceScores
        });

        emit SemanticIndexCreated(_creator, _keyword);
    }

    /**
     * @dev Submits a pre-computed semantic resolution result
     * Called by the off-chain indexer after computing semantic similarity
     * @param _creator Intent creator
     * @param _query Query string this resolution applies to
     * @param _citations Matching citations sorted by confidence (descending)
     * @param _confidences Confidence scores (0-100) for each citation
     */
    function submitResolution(
        address _creator,
        string memory _query,
        string[] memory _citations,
        uint256[] memory _confidences
    ) external onlyRole(INDEXER_ROLE) {
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");
        require(_citations.length == _confidences.length, "Array length mismatch");
        require(_citations.length > 0, "Empty resolution");
        require(_citations.length <= MAX_TOPK_RESULTS, "Too many results");

        bytes32 queryHash = keccak256(abi.encodePacked(_query));
        resolutionCache[_creator][queryHash] = ResolutionResult({
            citations: _citations,
            confidences: _confidences,
            resolvedAt: block.timestamp
        });

        emit ResolutionSubmitted(_creator, _query, _citations.length);
    }

    /**
     * @dev Batch submits pre-computed semantic resolution results
     * @param _creator Intent creator
     * @param _queries Array of query strings
     * @param _citationsArray Array of citation arrays
     * @param _confidencesArray Array of confidence arrays
     */
    function submitResolutionBatch(
        address _creator,
        string[] memory _queries,
        string[][] memory _citationsArray,
        uint256[][] memory _confidencesArray
    ) external onlyRole(INDEXER_ROLE) {
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");
        require(_queries.length == _citationsArray.length, "Array length mismatch");
        require(_queries.length == _confidencesArray.length, "Array length mismatch");
        require(_queries.length <= MAX_RESOLUTION_BATCH, "Batch too large");

        for (uint256 i = 0; i < _queries.length; i++) {
            require(_citationsArray[i].length == _confidencesArray[i].length, "Inner array mismatch");
            require(_citationsArray[i].length > 0, "Empty resolution in batch");
            require(_citationsArray[i].length <= MAX_TOPK_RESULTS, "Too many results in batch");

            bytes32 queryHash = keccak256(abi.encodePacked(_queries[i]));
            resolutionCache[_creator][queryHash] = ResolutionResult({
                citations: _citationsArray[i],
                confidences: _confidencesArray[i],
                resolvedAt: block.timestamp
            });

            emit ResolutionSubmitted(_creator, _queries[i], _citationsArray[i].length);
        }
    }

    /**
     * @dev Resolves ambiguity by checking resolution cache first, then falling back
     * to exact-match semantic index lookup.
     * Now a view function — no event emission (callers log outcomes themselves).
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
    ) external view returns (string memory citation, uint256 confidence) {
        require(
            corpusRegistry[_creator].corpusHash == _corpusHash,
            "Corpus hash mismatch"
        );
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");

        bytes32 queryHash = keccak256(abi.encodePacked(_query));

        // Check resolution cache first (pre-computed semantic results)
        ResolutionResult storage cached = resolutionCache[_creator][queryHash];
        if (cached.citations.length > 0) {
            return _findBest(cached.citations, cached.confidences);
        }

        // Fall back to exact-match semantic index
        SemanticIndex storage index = semanticIndices[_creator][queryHash];
        if (index.citations.length == 0) {
            return ("", 0);
        }

        return _findBest(index.citations, index.relevanceScores);
    }

    /**
     * @dev Resolves ambiguity returning top-k results sorted by confidence
     * @param _creator Intent creator
     * @param _query Ambiguous term or query
     * @param _corpusHash Expected corpus hash for verification
     * @param _k Number of results to return (1 to MAX_TOPK_RESULTS)
     * @return citations Top-k citations sorted by confidence (descending)
     * @return confidences Corresponding confidence scores
     */
    function resolveAmbiguityTopK(
        address _creator,
        string memory _query,
        bytes32 _corpusHash,
        uint256 _k
    ) external view returns (string[] memory citations, uint256[] memory confidences) {
        require(
            corpusRegistry[_creator].corpusHash == _corpusHash,
            "Corpus hash mismatch"
        );
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");
        require(_k > 0 && _k <= MAX_TOPK_RESULTS, "Invalid k value");

        bytes32 queryHash = keccak256(abi.encodePacked(_query));

        // Check resolution cache first
        ResolutionResult storage cached = resolutionCache[_creator][queryHash];
        if (cached.citations.length > 0) {
            return _selectTopK(cached.citations, cached.confidences, _k);
        }

        // Fall back to semantic index
        SemanticIndex storage index = semanticIndices[_creator][queryHash];
        if (index.citations.length == 0) {
            return (new string[](0), new uint256[](0));
        }

        return _selectTopK(index.citations, index.relevanceScores, _k);
    }

    /**
     * @dev Batch resolves multiple queries in a single call
     * Returns the best citation and confidence for each query
     * @param _creator Intent creator
     * @param _queries Array of query strings
     * @param _corpusHash Expected corpus hash for verification
     * @return citations Best citation for each query
     * @return confidences Confidence score for each query
     */
    function resolveAmbiguityBatch(
        address _creator,
        string[] memory _queries,
        bytes32 _corpusHash
    ) external view returns (string[] memory citations, uint256[] memory confidences) {
        require(
            corpusRegistry[_creator].corpusHash == _corpusHash,
            "Corpus hash mismatch"
        );
        require(corpusRegistry[_creator].isFrozen, "Corpus not frozen");
        require(_queries.length <= MAX_RESOLUTION_BATCH, "Batch too large");

        citations = new string[](_queries.length);
        confidences = new uint256[](_queries.length);

        for (uint256 i = 0; i < _queries.length; i++) {
            bytes32 queryHash = keccak256(abi.encodePacked(_queries[i]));

            // Check resolution cache first
            ResolutionResult storage cached = resolutionCache[_creator][queryHash];
            if (cached.citations.length > 0) {
                (citations[i], confidences[i]) = _findBest(cached.citations, cached.confidences);
                continue;
            }

            // Fall back to semantic index
            SemanticIndex storage index = semanticIndices[_creator][queryHash];
            if (index.citations.length == 0) {
                citations[i] = "";
                confidences[i] = 0;
                continue;
            }

            (citations[i], confidences[i]) = _findBest(index.citations, index.relevanceScores);
        }

        return (citations, confidences);
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
     * @dev Retrieves a cached resolution result
     * @param _creator Intent creator
     * @param _query Query string to look up
     * @return citations Cached citations
     * @return confidences Cached confidence scores
     * @return resolvedAt Timestamp when the resolution was submitted
     */
    function getResolution(
        address _creator,
        string memory _query
    ) external view returns (string[] memory citations, uint256[] memory confidences, uint256 resolvedAt) {
        bytes32 queryHash = keccak256(abi.encodePacked(_query));
        ResolutionResult storage result = resolutionCache[_creator][queryHash];
        return (result.citations, result.confidences, result.resolvedAt);
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
        require(_keywords.length <= MAX_BATCH_SIZE, "Batch size exceeds limit");

        for (uint i = 0; i < _keywords.length; i++) {
            require(_citationsArray[i].length <= MAX_CITATIONS_PER_INDEX, "Too many citations in batch item");
            require(_citationsArray[i].length == _scoresArray[i].length, "Citations/scores mismatch in batch item");

            bytes32 indexKey = keccak256(abi.encodePacked(_keywords[i]));

            semanticIndices[_creator][indexKey] = SemanticIndex({
                keyword: _keywords[i],
                citations: _citationsArray[i],
                relevanceScores: _scoresArray[i]
            });

            emit SemanticIndexCreated(_creator, _keywords[i]);
        }
    }

    /**
     * @dev Internal: find the highest-scoring citation from arrays
     */
    function _findBest(
        string[] storage _citations,
        uint256[] storage _scores
    ) private view returns (string memory citation, uint256 confidence) {
        uint256 maxScore = 0;
        uint256 maxIdx = 0;
        uint256 len = _scores.length > MAX_CITATIONS_PER_INDEX
            ? MAX_CITATIONS_PER_INDEX
            : _scores.length;

        for (uint256 i = 0; i < len; i++) {
            if (_scores[i] > maxScore) {
                maxScore = _scores[i];
                maxIdx = i;
            }
        }

        return (_citations[maxIdx], maxScore);
    }

    /**
     * @dev Internal: select top-k results by confidence (descending)
     */
    function _selectTopK(
        string[] storage _citations,
        uint256[] storage _scores,
        uint256 _k
    ) private view returns (string[] memory citations, uint256[] memory confidences) {
        uint256 len = _citations.length;
        uint256 resultCount = _k < len ? _k : len;
        citations = new string[](resultCount);
        confidences = new uint256[](resultCount);

        bool[] memory used = new bool[](len);

        for (uint256 r = 0; r < resultCount; r++) {
            uint256 bestIdx = 0;
            bool found = false;

            for (uint256 i = 0; i < len; i++) {
                if (used[i]) continue;
                if (!found || _scores[i] > confidences[r]) {
                    bestIdx = i;
                    confidences[r] = _scores[i];
                    found = true;
                }
            }

            used[bestIdx] = true;
            citations[r] = _citations[bestIdx];
        }

        return (citations, confidences);
    }
}

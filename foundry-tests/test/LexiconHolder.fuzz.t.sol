// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/LexiconHolder.sol";

contract LexiconHolderFuzzTest is Test {
    LexiconHolder public lexiconHolder;

    address public indexer;
    address public creator;

    bytes32 public corpusHash;

    function setUp() public {
        lexiconHolder = new LexiconHolder();

        indexer = makeAddr("indexer");
        creator = makeAddr("creator");

        bytes32 INDEXER_ROLE = lexiconHolder.INDEXER_ROLE();
        lexiconHolder.grantRole(INDEXER_ROLE, indexer);

        corpusHash = keccak256("test corpus");

        vm.prank(indexer);
        lexiconHolder.freezeCorpus(
            creator,
            corpusHash,
            "ipfs://test-corpus",
            2020,
            2025
        );
    }

    /// @dev Fuzz: resolveAmbiguity always returns 0 confidence for unknown queries
    function testFuzz_unknownQueryReturnsZeroConfidence(string calldata query) external view {
        (string memory citation, uint256 confidence) = lexiconHolder.resolveAmbiguity(
            creator,
            query,
            corpusHash
        );
        // Unless we've indexed this exact query, confidence should be 0
        // (We haven't created any indices in setUp beyond the frozen corpus)
        assertEq(confidence, 0, "Unknown query should return 0 confidence");
        assertEq(bytes(citation).length, 0, "Unknown query should return empty citation");
    }

    /// @dev Fuzz: submitted resolution confidence is always returned correctly
    function testFuzz_submittedResolutionConfidence(uint256 confidence) external {
        confidence = bound(confidence, 0, 100);

        string[] memory citations = new string[](1);
        citations[0] = "Test citation";
        uint256[] memory confidences = new uint256[](1);
        confidences[0] = confidence;

        vm.prank(indexer);
        lexiconHolder.submitResolution(
            creator,
            "fuzz_query",
            citations,
            confidences
        );

        (string memory retCitation, uint256 retConfidence) = lexiconHolder.resolveAmbiguity(
            creator,
            "fuzz_query",
            corpusHash
        );

        assertEq(retConfidence, confidence, "Returned confidence should match submitted");
        assertEq(
            keccak256(bytes(retCitation)),
            keccak256(bytes("Test citation")),
            "Returned citation should match submitted"
        );
    }

    /// @dev Fuzz: topK never returns more than k results
    function testFuzz_topKNeverExceedsK(uint256 k) external {
        k = bound(k, 1, 10);

        // Submit a resolution with 5 results
        string[] memory citations = new string[](5);
        uint256[] memory confidences = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            citations[i] = string(abi.encodePacked("Citation ", vm.toString(i)));
            confidences[i] = 100 - (i * 10);
        }

        vm.prank(indexer);
        lexiconHolder.submitResolution(creator, "topk_fuzz", citations, confidences);

        (string[] memory retCitations, uint256[] memory retConfidences) =
            lexiconHolder.resolveAmbiguityTopK(creator, "topk_fuzz", corpusHash, k);

        uint256 expected = k < 5 ? k : 5;
        assertEq(retCitations.length, expected, "Should return min(k, available) results");
        assertEq(retConfidences.length, expected, "Confidences length should match citations");
    }

    /// @dev Fuzz: topK results are sorted by confidence descending
    function testFuzz_topKSortedDescending(uint256 k) external {
        k = bound(k, 2, 10);

        // Submit 10 results with random-ish confidences
        string[] memory citations = new string[](10);
        uint256[] memory confidences = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            citations[i] = string(abi.encodePacked("C", vm.toString(i)));
            confidences[i] = uint256(keccak256(abi.encodePacked(i, k))) % 101;
        }

        vm.prank(indexer);
        lexiconHolder.submitResolution(creator, "sorted_fuzz", citations, confidences);

        (, uint256[] memory retConfidences) =
            lexiconHolder.resolveAmbiguityTopK(creator, "sorted_fuzz", corpusHash, k);

        for (uint256 i = 1; i < retConfidences.length; i++) {
            assertGe(
                retConfidences[i - 1],
                retConfidences[i],
                "Results should be sorted by confidence descending"
            );
        }
    }

    /// @dev Fuzz: resolution cache takes precedence over semantic index
    function testFuzz_cachePrecedenceOverIndex(uint256 indexScore, uint256 cacheScore) external {
        indexScore = bound(indexScore, 0, 100);
        cacheScore = bound(cacheScore, 0, 100);

        // Create semantic index
        string[] memory indexCitations = new string[](1);
        indexCitations[0] = "Index citation";
        uint256[] memory indexScores = new uint256[](1);
        indexScores[0] = indexScore;

        vm.prank(indexer);
        lexiconHolder.createSemanticIndex(creator, "precedence_test", indexCitations, indexScores);

        // Submit cached resolution
        string[] memory cacheCitations = new string[](1);
        cacheCitations[0] = "Cache citation";
        uint256[] memory cacheConfidences = new uint256[](1);
        cacheConfidences[0] = cacheScore;

        vm.prank(indexer);
        lexiconHolder.submitResolution(creator, "precedence_test", cacheCitations, cacheConfidences);

        (string memory citation, uint256 confidence) = lexiconHolder.resolveAmbiguity(
            creator,
            "precedence_test",
            corpusHash
        );

        // Cache should always win regardless of scores
        assertEq(
            keccak256(bytes(citation)),
            keccak256(bytes("Cache citation")),
            "Cache should take precedence over index"
        );
        assertEq(confidence, cacheScore, "Should return cache confidence");
    }

    /// @dev Fuzz: batch resolution count matches query count
    function testFuzz_batchResolutionCountMatchesQueries(uint256 count) external view {
        count = bound(count, 1, 20);

        string[] memory queries = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            queries[i] = string(abi.encodePacked("batch_", vm.toString(i)));
        }

        (string[] memory citations, uint256[] memory confidences) =
            lexiconHolder.resolveAmbiguityBatch(creator, queries, corpusHash);

        assertEq(citations.length, count, "Should return one citation per query");
        assertEq(confidences.length, count, "Should return one confidence per query");
    }

    /// @dev Fuzz: submitResolution rejects more than MAX_TOPK_RESULTS
    function testFuzz_submitResolutionRejectsOverflow(uint256 resultCount) external {
        resultCount = bound(resultCount, 11, 50);

        string[] memory citations = new string[](resultCount);
        uint256[] memory confidences = new uint256[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            citations[i] = "Citation";
            confidences[i] = 80;
        }

        vm.prank(indexer);
        vm.expectRevert("Too many results");
        lexiconHolder.submitResolution(creator, "overflow_query", citations, confidences);
    }
}

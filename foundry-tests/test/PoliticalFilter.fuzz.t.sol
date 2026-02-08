// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/ExecutionAgent.sol";
import "../../contracts/LexiconHolder.sol";

contract PoliticalFilterFuzzTest is Test {
    ExecutionAgent public executionAgent;
    LexiconHolder public lexiconHolder;

    address public executor;
    address public creator;

    bytes32 public corpusHash;

    uint256 constant MAX_ACTION_LENGTH = 1000;

    function setUp() public {
        lexiconHolder = new LexiconHolder();
        executionAgent = new ExecutionAgent(address(lexiconHolder));

        executor = makeAddr("executor");
        creator = makeAddr("creator");

        corpusHash = keccak256("test_corpus");

        // Grant executor role
        executionAgent.grantRole(executionAgent.EXECUTOR_ROLE(), executor);

        // Freeze corpus
        lexiconHolder.freezeCorpus(
            creator,
            corpusHash,
            "ipfs://corpus",
            2020,
            2025
        );

        // Activate execution
        vm.prank(executor);
        executionAgent.activateExecution(creator);
    }

    /// @notice Helper: create a semantic index with high confidence for a given action
    function _createHighConfidenceIndex(string memory action) internal {
        string[] memory citations = new string[](1);
        citations[0] = "High confidence citation";
        uint256[] memory scores = new uint256[](1);
        scores[0] = 98;

        lexiconHolder.createSemanticIndex(creator, action, citations, scores);
    }

    /// @notice Fuzz test: Prepend random prefix to known political keywords, verify always blocked
    function testFuzz_PoliticalKeywordsAlwaysBlocked(string memory prefix) public {
        vm.assume(bytes(prefix).length < 100);

        string[4] memory politicalKeywords = [
            "electoral",
            "political",
            "lobbying",
            "policy"
        ];

        for (uint256 i = 0; i < politicalKeywords.length; i++) {
            string memory action = string(abi.encodePacked(prefix, " ", politicalKeywords[i], " activity"));

            // Only test if within max action length
            if (bytes(action).length > MAX_ACTION_LENGTH) continue;

            _createHighConfidenceIndex(action);

            vm.prank(executor);
            vm.expectRevert("Action violates No Political Agency Clause");
            executionAgent.executeAction(creator, action, action, corpusHash);
        }
    }

    /// @notice Fuzz test: Generate benign action strings from a safe alphabet, verify they pass
    function testFuzz_BenignActionsPass(uint256 seed) public {
        // Build a benign action from safe characters that do not contain political keywords
        bytes memory safeChars = "abcdfghjkmnqrtuvwxyz0123456789";
        uint256 length = (seed % 20) + 5; // 5 to 24 characters
        if (length > 24) length = 24;

        bytes memory actionBytes = new bytes(length);
        uint256 currentSeed = seed;
        for (uint256 i = 0; i < length; i++) {
            currentSeed = uint256(keccak256(abi.encodePacked(currentSeed, i)));
            actionBytes[i] = safeChars[currentSeed % safeChars.length];
        }

        string memory action = string(actionBytes);

        _createHighConfidenceIndex(action);

        vm.prank(executor);
        executionAgent.executeAction(creator, action, action, corpusHash);

        ExecutionAgent.ExecutionRecord[] memory logs = executionAgent.getExecutionLogs(creator);
        assertEq(logs.length, 1, "Benign action should be logged");
    }

    /// @notice Fuzz test: Case variations of "electoral" are all blocked
    function testFuzz_CaseInsensitiveDetection(uint8 caseVariation) public {
        string[4] memory variants = [
            "electoral",
            "ELECTORAL",
            "Electoral",
            "eLeCtoRaL"
        ];

        uint256 idx = uint256(caseVariation) % variants.length;
        string memory action = string(abi.encodePacked("fund ", variants[idx], " campaign"));

        _createHighConfidenceIndex(action);

        vm.prank(executor);
        vm.expectRevert("Action violates No Political Agency Clause");
        executionAgent.executeAction(creator, action, action, corpusHash);
    }

    /// @notice Fuzz test: Strings longer than MAX_ACTION_LENGTH (1000) should be blocked
    function testFuzz_MaxStringLengthEnforcement(uint256 extraLength) public {
        vm.assume(extraLength >= 1 && extraLength <= 1000);

        uint256 totalLength = MAX_ACTION_LENGTH + extraLength;
        bytes memory longAction = new bytes(totalLength);
        for (uint256 i = 0; i < totalLength; i++) {
            longAction[i] = "a";
        }

        string memory action = string(longAction);

        vm.prank(executor);
        vm.expectRevert("Action string too long");
        executionAgent.executeAction(creator, action, action, corpusHash);
    }
}

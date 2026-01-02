// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/ExecutionAgent.sol";
import "../../contracts/LexiconHolder.sol";

contract ExecutionAgentFuzzTest is Test {
    ExecutionAgent public executionAgent;
    LexiconHolder public lexiconHolder;

    address public executor;
    address public creator;
    address public recipient;

    bytes32 public corpusHash;

    uint256 constant TWENTY_YEARS = 20 * 365 days;
    uint256 constant CONFIDENCE_THRESHOLD = 95;

    function setUp() public {
        lexiconHolder = new LexiconHolder();
        executionAgent = new ExecutionAgent(address(lexiconHolder));

        executor = makeAddr("executor");
        creator = makeAddr("creator");
        recipient = makeAddr("recipient");

        corpusHash = keccak256("test_corpus");

        // Grant executor role
        executionAgent.grantRole(executionAgent.EXECUTOR_ROLE(), executor);

        // Setup lexicon holder
        lexiconHolder.freezeCorpus(
            creator,
            corpusHash,
            "ipfs://corpus",
            2020,
            2025
        );
    }

    /// @notice Fuzz test: Confidence threshold is always 95
    function testFuzz_ConfidenceThresholdImmutable() public view {
        assertEq(executionAgent.CONFIDENCE_THRESHOLD(), 95);
    }

    /// @notice Fuzz test: Sunset duration is always 20 years
    function testFuzz_SunsetDurationImmutable() public view {
        assertEq(executionAgent.SUNSET_DURATION(), TWENTY_YEARS);
    }

    /// @notice Fuzz test: Treasury deposits are correctly tracked
    function testFuzz_TreasuryDeposit(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1000 ether);

        vm.deal(address(this), amount);
        executionAgent.depositToTreasury{value: amount}(creator);

        assertEq(executionAgent.treasuries(creator), amount);
    }

    /// @notice Fuzz test: Treasury accumulates correctly
    function testFuzz_TreasuryAccumulation(uint256 amount1, uint256 amount2) public {
        vm.assume(amount1 > 0 && amount1 <= 500 ether);
        vm.assume(amount2 > 0 && amount2 <= 500 ether);

        vm.deal(address(this), amount1 + amount2);

        executionAgent.depositToTreasury{value: amount1}(creator);
        executionAgent.depositToTreasury{value: amount2}(creator);

        assertEq(executionAgent.treasuries(creator), amount1 + amount2);
    }

    /// @notice Fuzz test: Revenue distribution respects treasury balance
    function testFuzz_RevenueDistribution(uint256 treasuryAmount, uint256 distributeAmount) public {
        vm.assume(treasuryAmount > 0 && treasuryAmount <= 100 ether);
        vm.assume(distributeAmount > 0 && distributeAmount <= 100 ether);

        // Setup
        vm.deal(address(this), treasuryAmount);
        executionAgent.depositToTreasury{value: treasuryAmount}(creator);

        vm.prank(executor);
        executionAgent.activateExecution(creator);

        if (distributeAmount > treasuryAmount) {
            vm.prank(executor);
            vm.expectRevert("Insufficient treasury funds");
            executionAgent.distributeRevenue(creator, recipient, distributeAmount);
        } else {
            uint256 recipientBalanceBefore = recipient.balance;

            vm.prank(executor);
            executionAgent.distributeRevenue(creator, recipient, distributeAmount);

            assertEq(executionAgent.treasuries(creator), treasuryAmount - distributeAmount);
            assertEq(recipient.balance, recipientBalanceBefore + distributeAmount);
        }
    }

    /// @notice Fuzz test: License royalty percentage cannot exceed 100%
    function testFuzz_LicenseRoyaltyLimit(uint256 royaltyPercentage) public {
        vm.prank(executor);
        executionAgent.activateExecution(creator);

        // Create high confidence index
        string[] memory citations = new string[](1);
        citations[0] = "High confidence citation";
        uint256[] memory scores = new uint256[](1);
        scores[0] = 98;

        lexiconHolder.createSemanticIndex(creator, "license_issuance", citations, scores);

        if (royaltyPercentage > 10000) {
            vm.prank(executor);
            vm.expectRevert("Royalty cannot exceed 100%");
            executionAgent.issueLicense(
                creator,
                recipient,
                address(0x123),
                royaltyPercentage,
                365 days,
                corpusHash
            );
        } else {
            vm.prank(executor);
            executionAgent.issueLicense(
                creator,
                recipient,
                address(0x123),
                royaltyPercentage,
                365 days,
                corpusHash
            );

            ExecutionAgent.License[] memory licenses = executionAgent.getLicenses(creator);
            assertEq(licenses.length, 1);
            assertEq(licenses[0].royaltyPercentage, royaltyPercentage);
        }
    }

    /// @notice Fuzz test: Execution inactive after activation timestamp + 20 years
    function testFuzz_ExecutionActiveWindow(uint256 timeElapsed) public {
        vm.assume(timeElapsed <= TWENTY_YEARS + 365 days);

        vm.prank(executor);
        executionAgent.activateExecution(creator);

        vm.warp(block.timestamp + timeElapsed);

        bool expectedActive = timeElapsed < TWENTY_YEARS && !executionAgent.isSunset(creator);
        assertEq(executionAgent.isExecutionActive(creator), expectedActive);
    }

    /// @notice Fuzz test: Sunset can only be activated after 20 years
    function testFuzz_SunsetTiming(uint256 timeElapsed) public {
        vm.prank(executor);
        executionAgent.activateExecution(creator);

        vm.warp(block.timestamp + timeElapsed);

        if (timeElapsed < TWENTY_YEARS) {
            vm.expectRevert("Sunset duration not reached");
            executionAgent.activateSunset(creator);
        } else {
            executionAgent.activateSunset(creator);
            assertTrue(executionAgent.isSunset(creator));
        }
    }

    /// @notice Fuzz test: Political keywords are blocked
    function testFuzz_PoliticalKeywordBlocking(string memory baseAction) public {
        vm.assume(bytes(baseAction).length < 100);

        vm.prank(executor);
        executionAgent.activateExecution(creator);

        // Create index for action
        string[] memory citations = new string[](1);
        citations[0] = "Citation";
        uint256[] memory scores = new uint256[](1);
        scores[0] = 98;

        string[] memory politicalKeywords = new string[](4);
        politicalKeywords[0] = "electoral";
        politicalKeywords[1] = "political";
        politicalKeywords[2] = "lobbying";
        politicalKeywords[3] = "policy";

        for (uint i = 0; i < politicalKeywords.length; i++) {
            string memory action = string(abi.encodePacked(baseAction, " ", politicalKeywords[i], " activity"));

            lexiconHolder.createSemanticIndex(creator, action, citations, scores);

            vm.prank(executor);
            vm.expectRevert("Action violates No Political Agency Clause");
            executionAgent.executeAction(creator, action, action, corpusHash);
        }
    }

    /// @notice Invariant: Sunset state is irreversible
    function testInvariant_SunsetIrreversible() public {
        vm.prank(executor);
        executionAgent.activateExecution(creator);

        vm.warp(block.timestamp + TWENTY_YEARS + 1);

        executionAgent.activateSunset(creator);
        assertTrue(executionAgent.isSunset(creator));

        // Cannot sunset again
        vm.expectRevert("Already sunset");
        executionAgent.activateSunset(creator);

        // Execution is no longer active
        assertFalse(executionAgent.isExecutionActive(creator));
    }

    /// @notice Invariant: Confidence threshold actions
    function testFuzz_ConfidenceThresholdEnforcement(uint256 confidence) public {
        vm.assume(confidence <= 100);

        vm.prank(executor);
        executionAgent.activateExecution(creator);

        string memory action = "test_action";
        string[] memory citations = new string[](1);
        citations[0] = "Test citation";
        uint256[] memory scores = new uint256[](1);
        scores[0] = confidence;

        lexiconHolder.createSemanticIndex(creator, action, citations, scores);

        vm.prank(executor);
        executionAgent.executeAction(creator, action, action, corpusHash);

        ExecutionAgent.ExecutionRecord[] memory logs = executionAgent.getExecutionLogs(creator);

        if (confidence >= CONFIDENCE_THRESHOLD) {
            // Action should be logged
            assertEq(logs.length, 1);
            assertEq(logs[0].confidence, confidence);
        } else {
            // Action should not be logged (inaction default)
            assertEq(logs.length, 0);
        }
    }
}

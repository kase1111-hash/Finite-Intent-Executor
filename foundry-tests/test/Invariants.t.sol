// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../contracts/ExecutionAgent.sol";
import "../../contracts/LexiconHolder.sol";
import "../../contracts/SunsetProtocol.sol";
import "../../contracts/IntentCaptureModule.sol";

/// @title Handler for invariant testing
/// @notice Performs bounded random actions on the protocol
contract ProtocolHandler is Test {
    ExecutionAgent public executionAgent;
    LexiconHolder public lexiconHolder;
    SunsetProtocol public sunsetProtocol;
    IntentCaptureModule public intentModule;

    address[] public actors;
    address public currentActor;

    bytes32 public constant CORPUS_HASH = keccak256("invariant_corpus");

    modifier useActor(uint256 actorIndexSeed) {
        currentActor = actors[bound(actorIndexSeed, 0, actors.length - 1)];
        vm.startPrank(currentActor);
        _;
        vm.stopPrank();
    }

    constructor(
        ExecutionAgent _executionAgent,
        LexiconHolder _lexiconHolder,
        SunsetProtocol _sunsetProtocol,
        IntentCaptureModule _intentModule
    ) {
        executionAgent = _executionAgent;
        lexiconHolder = _lexiconHolder;
        sunsetProtocol = _sunsetProtocol;
        intentModule = _intentModule;

        // Create actors
        for (uint256 i = 0; i < 5; i++) {
            actors.push(makeAddr(string(abi.encodePacked("actor", vm.toString(i)))));
        }
    }

    function depositToTreasury(uint256 actorSeed, uint256 amount) public useActor(actorSeed) {
        amount = bound(amount, 0.001 ether, 10 ether);
        vm.deal(currentActor, amount);
        executionAgent.depositToTreasury{value: amount}(currentActor);
    }

    function warpTime(uint256 timeJump) public {
        timeJump = bound(timeJump, 1 days, 365 days);
        vm.warp(block.timestamp + timeJump);
    }
}

/// @title Protocol Invariant Tests
/// @notice Tests critical protocol invariants that must always hold
contract InvariantTest is StdInvariant, Test {
    ExecutionAgent public executionAgent;
    LexiconHolder public lexiconHolder;
    SunsetProtocol public sunsetProtocol;
    IntentCaptureModule public intentModule;
    ProtocolHandler public handler;

    uint256 constant TWENTY_YEARS = 20 * 365 days;
    uint256 constant CONFIDENCE_THRESHOLD = 95;

    function setUp() public {
        // Deploy contracts
        lexiconHolder = new LexiconHolder();
        intentModule = new IntentCaptureModule();
        executionAgent = new ExecutionAgent(address(lexiconHolder));
        sunsetProtocol = new SunsetProtocol(
            address(executionAgent),
            address(lexiconHolder)
        );

        // Create handler
        handler = new ProtocolHandler(
            executionAgent,
            lexiconHolder,
            sunsetProtocol,
            intentModule
        );

        // Target only the handler for invariant testing
        targetContract(address(handler));
    }

    /// @notice CRITICAL INVARIANT: CONFIDENCE_THRESHOLD is always 95
    function invariant_ConfidenceThresholdIs95() public view {
        assertEq(
            executionAgent.CONFIDENCE_THRESHOLD(),
            95,
            "CRITICAL: Confidence threshold must always be 95"
        );
    }

    /// @notice CRITICAL INVARIANT: SUNSET_DURATION is always 20 years
    function invariant_SunsetDurationIs20Years() public view {
        assertEq(
            executionAgent.SUNSET_DURATION(),
            TWENTY_YEARS,
            "CRITICAL: Sunset duration must always be 20 years"
        );
    }

    /// @notice CRITICAL INVARIANT: SunsetProtocol SUNSET_DURATION is always 20 years
    function invariant_SunsetProtocolDurationIs20Years() public view {
        assertEq(
            sunsetProtocol.SUNSET_DURATION(),
            TWENTY_YEARS,
            "CRITICAL: SunsetProtocol duration must always be 20 years"
        );
    }

    /// @notice INVARIANT: Prohibited political actions are always blocked
    function invariant_PoliticalActionsBlocked() public view {
        assertTrue(
            executionAgent.prohibitedActions(keccak256("electoral_activity")),
            "Electoral activity must be prohibited"
        );
        assertTrue(
            executionAgent.prohibitedActions(keccak256("political_advocacy")),
            "Political advocacy must be prohibited"
        );
        assertTrue(
            executionAgent.prohibitedActions(keccak256("lobbying")),
            "Lobbying must be prohibited"
        );
        assertTrue(
            executionAgent.prohibitedActions(keccak256("policy_influence")),
            "Policy influence must be prohibited"
        );
    }

    /// @notice INVARIANT: Treasury balances are never negative (implicit in uint256)
    function invariant_TreasuryNonNegative() public view {
        // This is implicitly enforced by uint256, but we verify logic
        address[] memory actors = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            actors[i] = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            // Balance is always >= 0 (uint256)
            assertTrue(executionAgent.treasuries(actors[i]) >= 0);
        }
    }
}

/// @title State Machine Tests for Critical State Transitions
/// @notice Tests that state transitions follow correct patterns
contract StateMachineTest is Test {
    IntentCaptureModule public intentModule;
    address public creator;
    address public triggerMechanism;
    address public dummyAsset;

    function setUp() public {
        intentModule = new IntentCaptureModule();
        creator = makeAddr("creator");
        triggerMechanism = makeAddr("triggerMechanism");
        dummyAsset = makeAddr("dummyAsset");

        intentModule.setTriggerMechanism(triggerMechanism);
    }

    /// @notice State: Uncaptured -> Captured (valid)
    function test_StateTransition_UncapturedToCaptured() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://c",
            "ipfs://a",
            2020,
            2025,
            assets
        );

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertFalse(intent.isTriggered);
        assertFalse(intent.isRevoked);
        assertTrue(intent.intentHash != bytes32(0));
    }

    /// @notice State: Captured -> Triggered (valid via trigger mechanism)
    function test_StateTransition_CapturedToTriggered() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://c",
            "ipfs://a",
            2020,
            2025,
            assets
        );

        vm.prank(triggerMechanism);
        intentModule.triggerIntent(creator);

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertTrue(intent.isTriggered);
    }

    /// @notice State: Captured -> Revoked (valid by creator)
    function test_StateTransition_CapturedToRevoked() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://c",
            "ipfs://a",
            2020,
            2025,
            assets
        );

        intentModule.revokeIntent();
        vm.stopPrank();

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertTrue(intent.isRevoked);
    }

    /// @notice State: Triggered -> Captured (INVALID - irreversible)
    function test_StateTransition_TriggeredToCaptured_Reverts() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://c",
            "ipfs://a",
            2020,
            2025,
            assets
        );

        vm.prank(triggerMechanism);
        intentModule.triggerIntent(creator);

        // Attempt to capture again should fail
        vm.prank(creator);
        vm.expectRevert("Intent already triggered");
        intentModule.captureIntent(
            keccak256("new"),
            keccak256("new"),
            "ipfs://new",
            "ipfs://new",
            2020,
            2025,
            assets
        );
    }

    /// @notice State: Revoked -> Captured (INVALID - irreversible)
    function test_StateTransition_RevokedToCaptured_Reverts() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://c",
            "ipfs://a",
            2020,
            2025,
            assets
        );

        intentModule.revokeIntent();

        // Attempt to capture again should fail
        vm.expectRevert("Intent has been revoked");
        intentModule.captureIntent(
            keccak256("new"),
            keccak256("new"),
            "ipfs://new",
            "ipfs://new",
            2020,
            2025,
            assets
        );
        vm.stopPrank();
    }

    /// @notice State: Triggered -> Triggered (INVALID - can't trigger twice)
    function test_StateTransition_TriggeredToTriggered_Reverts() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://c",
            "ipfs://a",
            2020,
            2025,
            assets
        );

        vm.prank(triggerMechanism);
        intentModule.triggerIntent(creator);

        // Attempt to trigger again should fail
        vm.prank(triggerMechanism);
        vm.expectRevert("Already triggered");
        intentModule.triggerIntent(creator);
    }
}

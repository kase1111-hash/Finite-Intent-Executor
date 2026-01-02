// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/IntentCaptureModule.sol";

contract IntentCaptureModuleFuzzTest is Test {
    IntentCaptureModule public intentModule;
    address public creator;
    address public triggerMechanism;
    address public dummyAsset;

    event IntentCaptured(
        address indexed creator,
        bytes32 intentHash,
        bytes32 corpusHash,
        uint256 captureTimestamp
    );
    event GoalAdded(address indexed creator, string description, uint256 priority);

    function setUp() public {
        intentModule = new IntentCaptureModule();
        creator = makeAddr("creator");
        triggerMechanism = makeAddr("triggerMechanism");
        dummyAsset = makeAddr("dummyAsset");

        intentModule.setTriggerMechanism(triggerMechanism);
    }

    /// @notice Fuzz test: Corpus window must be exactly 5-10 years
    function testFuzz_CorpusWindowValidation(
        uint256 startYear,
        uint256 endYear
    ) public {
        vm.assume(startYear > 1900 && startYear < 3000);
        vm.assume(endYear > 1900 && endYear < 3000);

        bytes32 intentHash = keccak256("intent");
        bytes32 corpusHash = keccak256("corpus");
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);

        if (endYear <= startYear) {
            vm.expectRevert("Invalid corpus window");
            intentModule.captureIntent(
                intentHash, corpusHash, "ipfs://c", "ipfs://a",
                startYear, endYear, assets
            );
        } else {
            uint256 windowSize = endYear - startYear;
            if (windowSize < 5 || windowSize > 10) {
                vm.expectRevert("Corpus window must be 5-10 years");
                intentModule.captureIntent(
                    intentHash, corpusHash, "ipfs://c", "ipfs://a",
                    startYear, endYear, assets
                );
            } else {
                // Should succeed
                intentModule.captureIntent(
                    intentHash, corpusHash, "ipfs://c", "ipfs://a",
                    startYear, endYear, assets
                );

                IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
                assertEq(intent.intentHash, intentHash);
                assertEq(intent.corpusStartYear, startYear);
                assertEq(intent.corpusEndYear, endYear);
            }
        }

        vm.stopPrank();
    }

    /// @notice Fuzz test: Goal priority must be 1-100
    function testFuzz_GoalPriorityValidation(uint256 priority) public {
        // First capture intent
        bytes32 intentHash = keccak256("intent");
        bytes32 corpusHash = keccak256("corpus");
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);
        intentModule.captureIntent(
            intentHash, corpusHash, "ipfs://c", "ipfs://a",
            2020, 2025, assets
        );

        bytes32 constraintsHash = keccak256("constraints");

        if (priority < 1 || priority > 100) {
            vm.expectRevert("Priority must be 1-100");
            intentModule.addGoal("Goal", constraintsHash, priority);
        } else {
            intentModule.addGoal("Goal", constraintsHash, priority);

            IntentCaptureModule.Goal[] memory goals = intentModule.getGoals(creator);
            assertEq(goals.length, 1);
            assertEq(goals[0].priority, priority);
        }

        vm.stopPrank();
    }

    /// @notice Fuzz test: Intent hash and corpus hash are stored correctly
    function testFuzz_HashStorage(bytes32 intentHash, bytes32 corpusHash) public {
        vm.assume(intentHash != bytes32(0));
        vm.assume(corpusHash != bytes32(0));

        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);
        intentModule.captureIntent(
            intentHash, corpusHash, "ipfs://c", "ipfs://a",
            2020, 2025, assets
        );

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertEq(intent.intentHash, intentHash);
        assertEq(intent.corpusHash, corpusHash);
        vm.stopPrank();
    }

    /// @notice Fuzz test: Multiple assets can be registered
    function testFuzz_MultipleAssets(uint8 assetCount) public {
        vm.assume(assetCount > 0 && assetCount <= 50);

        address[] memory assets = new address[](assetCount);
        for (uint8 i = 0; i < assetCount; i++) {
            assets[i] = address(uint160(i + 1000));
        }

        bytes32 intentHash = keccak256("intent");
        bytes32 corpusHash = keccak256("corpus");

        vm.startPrank(creator);
        intentModule.captureIntent(
            intentHash, corpusHash, "ipfs://c", "ipfs://a",
            2020, 2025, assets
        );

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertEq(intent.assetAddresses.length, assetCount);
        vm.stopPrank();
    }

    /// @notice Fuzz test: Version signing consistency
    function testFuzz_VersionSigning(bytes32 versionHash) public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);
        intentModule.captureIntent(
            keccak256("intent"), keccak256("corpus"),
            "ipfs://c", "ipfs://a", 2020, 2025, assets
        );

        // Before signing
        assertFalse(intentModule.isVersionSigned(creator, versionHash));

        // Sign version
        intentModule.signVersion(versionHash);

        // After signing
        assertTrue(intentModule.isVersionSigned(creator, versionHash));
        vm.stopPrank();
    }

    /// @notice Fuzz test: Only trigger mechanism can trigger
    function testFuzz_OnlyTriggerMechanismCanTrigger(address caller) public {
        vm.assume(caller != triggerMechanism);
        vm.assume(caller != address(0));

        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"), keccak256("corpus"),
            "ipfs://c", "ipfs://a", 2020, 2025, assets
        );

        // Non-trigger mechanism should fail
        vm.prank(caller);
        vm.expectRevert("Only TriggerMechanism can trigger");
        intentModule.triggerIntent(creator);

        // Trigger mechanism should succeed
        vm.prank(triggerMechanism);
        intentModule.triggerIntent(creator);

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertTrue(intent.isTriggered);
    }

    /// @notice Invariant: Triggered state is irreversible
    function testFuzz_TriggeredStateIrreversible() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"), keccak256("corpus"),
            "ipfs://c", "ipfs://a", 2020, 2025, assets
        );

        // Trigger
        vm.prank(triggerMechanism);
        intentModule.triggerIntent(creator);

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertTrue(intent.isTriggered);

        // Cannot trigger again
        vm.prank(triggerMechanism);
        vm.expectRevert("Already triggered");
        intentModule.triggerIntent(creator);
    }

    /// @notice Invariant: Revoked state is irreversible
    function testFuzz_RevokedStateIrreversible() public {
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.startPrank(creator);
        intentModule.captureIntent(
            keccak256("intent"), keccak256("corpus"),
            "ipfs://c", "ipfs://a", 2020, 2025, assets
        );

        intentModule.revokeIntent();

        IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
        assertTrue(intent.isRevoked);

        // Cannot capture new intent
        vm.expectRevert("Intent has been revoked");
        intentModule.captureIntent(
            keccak256("new"), keccak256("new"),
            "ipfs://new", "ipfs://new", 2020, 2025, assets
        );
        vm.stopPrank();
    }
}

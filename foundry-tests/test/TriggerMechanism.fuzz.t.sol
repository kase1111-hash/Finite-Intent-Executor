// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/IntentCaptureModule.sol";
import "../../contracts/TriggerMechanism.sol";
import "../../contracts/IPToken.sol";

contract TriggerMechanismFuzzTest is Test {
    IntentCaptureModule public intentModule;
    TriggerMechanism public triggerMechanism;
    IPToken public ipToken;

    address public creator;
    address public dummyAsset;

    function setUp() public {
        intentModule = new IntentCaptureModule();
        ipToken = new IPToken();
        triggerMechanism = new TriggerMechanism(address(intentModule));

        creator = makeAddr("creator");
        dummyAsset = makeAddr("dummyAsset");

        // Link TriggerMechanism to IntentModule
        intentModule.setTriggerMechanism(address(triggerMechanism));

        // Capture intent for creator
        address[] memory assets = new address[](1);
        assets[0] = dummyAsset;

        vm.prank(creator);
        intentModule.captureIntent(
            keccak256("intent"),
            keccak256("corpus"),
            "ipfs://corpus",
            "ipfs://assets",
            2020,
            2025,
            assets
        );
    }

    /// @notice Fuzz test: Deadman interval must be at least 30 days
    function testFuzz_DeadmanIntervalMinimum(uint256 interval) public {
        if (interval < 30 days) {
            vm.assume(interval < 30 days);

            vm.prank(creator);
            vm.expectRevert("Interval must be at least 30 days");
            triggerMechanism.configureDeadmanSwitch(interval);
        } else {
            vm.assume(interval >= 30 days && interval <= 365 days);

            vm.prank(creator);
            triggerMechanism.configureDeadmanSwitch(interval);

            TriggerMechanism.TriggerConfig memory config = triggerMechanism.getTriggerConfig(creator);
            assertTrue(config.isConfigured, "Trigger should be configured");
            assertEq(config.deadmanInterval, interval, "Deadman interval should match");
            assertEq(
                uint256(config.triggerType),
                uint256(TriggerMechanism.TriggerType.DeadmanSwitch),
                "Trigger type should be DeadmanSwitch"
            );
        }
    }

    /// @notice Fuzz test: Valid quorum configurations with fuzzed signer count and threshold
    function testFuzz_QuorumSignatureThreshold(uint8 numSigners, uint8 required) public {
        vm.assume(numSigners >= 2 && numSigners <= 20);
        vm.assume(required >= 2 && required <= numSigners);

        address[] memory signers = new address[](numSigners);
        for (uint256 i = 0; i < numSigners; i++) {
            signers[i] = makeAddr(string(abi.encodePacked("signer", vm.toString(i))));
        }

        vm.prank(creator);
        triggerMechanism.configureTrustedQuorum(signers, required);

        TriggerMechanism.TriggerConfig memory config = triggerMechanism.getTriggerConfig(creator);
        assertTrue(config.isConfigured, "Trigger should be configured");
        assertEq(config.requiredSignatures, required, "Required signatures should match");
        assertEq(
            uint256(config.triggerType),
            uint256(TriggerMechanism.TriggerType.TrustedQuorum),
            "Trigger type should be TrustedQuorum"
        );
    }

    /// @notice Fuzz test: Deadman switch triggers correctly based on timing
    function testFuzz_DeadmanSwitchTiming(uint256 interval, uint256 timeElapsed) public {
        vm.assume(interval >= 30 days && interval <= 365 days);
        vm.assume(timeElapsed <= interval + 365 days);

        vm.prank(creator);
        triggerMechanism.configureDeadmanSwitch(interval);

        vm.warp(block.timestamp + timeElapsed);

        if (timeElapsed < interval) {
            vm.expectRevert("Deadman interval not elapsed");
            triggerMechanism.executeDeadmanSwitch(creator);

            // Verify not triggered
            TriggerMechanism.TriggerConfig memory config = triggerMechanism.getTriggerConfig(creator);
            assertFalse(config.isTriggered, "Should not be triggered before interval elapses");
        } else {
            triggerMechanism.executeDeadmanSwitch(creator);

            // Verify triggered
            TriggerMechanism.TriggerConfig memory config = triggerMechanism.getTriggerConfig(creator);
            assertTrue(config.isTriggered, "Should be triggered after interval elapses");

            // Verify intent is also triggered
            IntentCaptureModule.IntentGraph memory intent = intentModule.getIntent(creator);
            assertTrue(intent.isTriggered, "Intent should be triggered");
        }
    }

    /// @notice Invariant: Once triggered, stays triggered (irreversible)
    function testInvariant_TriggerIrreversible() public {
        // Configure and trigger deadman switch
        vm.prank(creator);
        triggerMechanism.configureDeadmanSwitch(30 days);

        vm.warp(block.timestamp + 30 days);
        triggerMechanism.executeDeadmanSwitch(creator);

        TriggerMechanism.TriggerConfig memory config = triggerMechanism.getTriggerConfig(creator);
        assertTrue(config.isTriggered, "Should be triggered");

        // Attempting to execute again should revert
        vm.expectRevert("Already triggered");
        triggerMechanism.executeDeadmanSwitch(creator);

        // Attempting to reconfigure should revert
        vm.prank(creator);
        vm.expectRevert("Already triggered");
        triggerMechanism.configureDeadmanSwitch(60 days);

        // Verify it is still triggered
        config = triggerMechanism.getTriggerConfig(creator);
        assertTrue(config.isTriggered, "Must remain triggered (irreversible)");
    }
}

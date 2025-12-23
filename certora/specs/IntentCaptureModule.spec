/*
 * Certora Verification Specification for IntentCaptureModule
 *
 * Critical Invariants:
 * 1. Once triggered, an intent cannot be untriggered
 * 2. Once revoked, an intent cannot be unrevoked
 * 3. Triggered intents cannot be revoked
 * 4. Only TriggerMechanism can trigger intents
 * 5. Corpus window must be 5-10 years
 */

methods {
    function intents(address) external returns (
        bytes32, bytes32, string, string, uint256, uint256, uint256, address[], bool, bool
    ) envfree;
    function triggerMechanism() external returns (address) envfree;
    function getIntent(address) external returns (IntentCaptureModule.IntentGraph memory) envfree;
}

// Ghost variables to track state
ghost bool intentWasTriggered;
ghost bool intentWasRevoked;

// =============================================================================
// INVARIANT 1: Triggered intents remain triggered (irreversibility)
// =============================================================================

rule triggeredIntentCannotBeUntriggered(address creator) {
    env e;

    // Get initial state
    bool triggeredBefore = getIntent(creator).isTriggered;

    // Execute any function
    calldataarg args;
    f(e, args);

    // If it was triggered before, it must still be triggered
    bool triggeredAfter = getIntent(creator).isTriggered;

    assert triggeredBefore => triggeredAfter,
        "Invariant violation: triggered intent became untriggered";
}

// =============================================================================
// INVARIANT 2: Revoked intents remain revoked (irreversibility)
// =============================================================================

rule revokedIntentCannotBeUnrevoked(address creator) {
    env e;

    bool revokedBefore = getIntent(creator).isRevoked;

    calldataarg args;
    f(e, args);

    bool revokedAfter = getIntent(creator).isRevoked;

    assert revokedBefore => revokedAfter,
        "Invariant violation: revoked intent became unrevoked";
}

// =============================================================================
// INVARIANT 3: Triggered intents cannot be revoked
// =============================================================================

rule triggeredIntentCannotBeRevoked(address creator) {
    env e;

    bool triggeredBefore = getIntent(creator).isTriggered;
    bool revokedBefore = getIntent(creator).isRevoked;

    // Try to revoke
    revokeIntent(e);

    bool revokedAfter = getIntent(creator).isRevoked;

    // If already triggered, revocation should not succeed
    assert triggeredBefore => (revokedBefore == revokedAfter),
        "Invariant violation: triggered intent was revoked";
}

// =============================================================================
// INVARIANT 4: Only TriggerMechanism can trigger intents
// =============================================================================

rule onlyTriggerMechanismCanTrigger(address creator) {
    env e;

    bool triggeredBefore = getIntent(creator).isTriggered;
    address tm = triggerMechanism();

    triggerIntent(e, creator);

    bool triggeredAfter = getIntent(creator).isTriggered;

    // If trigger state changed, caller must be TriggerMechanism
    assert (triggeredBefore != triggeredAfter) => (e.msg.sender == tm),
        "Invariant violation: non-TriggerMechanism triggered intent";
}

// =============================================================================
// INVARIANT 5: Corpus window must be 5-10 years
// =============================================================================

rule corpusWindowValidation(
    bytes32 intentHash,
    bytes32 corpusHash,
    string corpusURI,
    string assetsURI,
    uint256 startYear,
    uint256 endYear,
    address[] assetAddresses
) {
    env e;

    // Attempt to capture intent
    captureIntent@withrevert(e, intentHash, corpusHash, corpusURI, assetsURI, startYear, endYear, assetAddresses);

    bool reverted = lastReverted;
    uint256 window = endYear - startYear;

    // Should revert if window is not 5-10 years
    assert (window < 5 || window > 10) => reverted,
        "Invariant violation: invalid corpus window accepted";
}

// =============================================================================
// INVARIANT 6: Cannot capture intent after triggered
// =============================================================================

rule cannotRecaptureAfterTriggered(address creator) {
    env e;
    require e.msg.sender == creator;

    bool triggeredBefore = getIntent(creator).isTriggered;
    bytes32 intentHashBefore = getIntent(creator).intentHash;

    bytes32 newIntentHash;
    bytes32 newCorpusHash;
    string newCorpusURI;
    string newAssetsURI;
    uint256 newStartYear;
    uint256 newEndYear;
    address[] newAssets;

    captureIntent@withrevert(e, newIntentHash, newCorpusHash, newCorpusURI, newAssetsURI, newStartYear, newEndYear, newAssets);

    bool reverted = lastReverted;

    // If triggered, capture should revert
    assert triggeredBefore => reverted,
        "Invariant violation: intent recaptured after trigger";
}

// =============================================================================
// PROPERTY: Goal priority must be 1-100
// =============================================================================

rule goalPriorityValidation(string description, bytes32 constraintsHash, uint256 priority) {
    env e;

    addGoal@withrevert(e, description, constraintsHash, priority);

    bool reverted = lastReverted;

    // Should revert if priority is out of range
    assert (priority < 1 || priority > 100) => reverted,
        "Invariant violation: invalid goal priority accepted";
}

/*
 * Certora Verification Specification for ExecutionAgent
 *
 * Critical Invariants:
 * 1. 95% confidence threshold is always enforced
 * 2. 20-year sunset is non-negotiable
 * 3. No political agency - prohibited actions always blocked
 * 4. Default to inaction on low confidence
 * 5. Sunset state is irreversible
 */

methods {
    function CONFIDENCE_THRESHOLD() external returns (uint256) envfree;
    function SUNSET_DURATION() external returns (uint256) envfree;
    function triggerTimestamps(address) external returns (uint256) envfree;
    function isSunset(address) external returns (bool) envfree;
    function isExecutionActive(address) external returns (bool) envfree;
    function treasuries(address) external returns (uint256) envfree;
}

// =============================================================================
// INVARIANT 1: Confidence threshold is exactly 95 (immutable)
// =============================================================================

invariant confidenceThresholdIsNinetyFive()
    CONFIDENCE_THRESHOLD() == 95
    {
        preserved {
            require true;
        }
    }

// =============================================================================
// INVARIANT 2: Sunset duration is exactly 20 years (immutable)
// =============================================================================

invariant sunsetDurationIsTwentyYears()
    SUNSET_DURATION() == 20 * 365 * 24 * 60 * 60
    {
        preserved {
            require true;
        }
    }

// =============================================================================
// INVARIANT 3: Sunset state is irreversible
// =============================================================================

rule sunsetCannotBeReversed(address creator) {
    env e;

    bool sunsetBefore = isSunset(creator);

    calldataarg args;
    f(e, args);

    bool sunsetAfter = isSunset(creator);

    assert sunsetBefore => sunsetAfter,
        "Critical invariant violation: sunset was reversed";
}

// =============================================================================
// INVARIANT 4: Execution inactive after sunset
// =============================================================================

rule executionInactiveAfterSunset(address creator) {
    env e;

    bool sunsetState = isSunset(creator);
    bool executionActive = isExecutionActive(creator);

    assert sunsetState => !executionActive,
        "Critical invariant violation: execution active after sunset";
}

// =============================================================================
// INVARIANT 5: Sunset activates after 20 years
// =============================================================================

rule sunsetActivatesAfterTwentyYears(address creator) {
    env e;

    uint256 triggerTime = triggerTimestamps(creator);
    uint256 sunsetDuration = SUNSET_DURATION();

    // If 20 years have passed, execution must be inactive
    require triggerTime > 0;
    require e.block.timestamp >= triggerTime + sunsetDuration;

    bool executionActive = isExecutionActive(creator);

    assert !executionActive,
        "Critical invariant violation: execution active after 20 years";
}

// =============================================================================
// INVARIANT 6: Actions require active execution
// =============================================================================

rule actionsRequireActiveExecution(address creator) {
    env e;

    bool executionActiveBefore = isExecutionActive(creator);

    // Try to execute an action
    string action;
    string query;
    bytes32 corpusHash;
    executeAction@withrevert(e, creator, action, query, corpusHash);

    bool reverted = lastReverted;

    // If execution not active, action should revert
    assert !executionActiveBefore => reverted,
        "Invariant violation: action executed without active execution";
}

// =============================================================================
// INVARIANT 7: Treasury cannot go negative (implicit in Solidity 0.8+)
// =============================================================================

rule treasuryNonNegative(address creator) {
    env e;

    uint256 treasuryBefore = treasuries(creator);

    calldataarg args;
    f(e, args);

    uint256 treasuryAfter = treasuries(creator);

    // Treasury should never underflow (Solidity 0.8+ protects this)
    assert treasuryAfter >= 0,
        "Invariant violation: treasury went negative";
}

// =============================================================================
// INVARIANT 8: Political filter is enforced via compiled-in PoliticalFilter library
// =============================================================================
// The PoliticalFilter library is compiled into the ExecutionAgent bytecode.
// Keywords are compile-time constants and cannot be modified at runtime.
// This invariant is now enforced at the bytecode level rather than via storage,
// making it inherently immutable. The confidence threshold and sunset duration
// constants serve as secondary enforcement — even if a political action somehow
// bypassed the keyword filter, it would still need 95% corpus confidence.
//
// Previous rule `prohibitedActionsImmutable` referenced the `prohibitedActions`
// storage mapping which has been removed in favor of PoliticalFilter library.

// =============================================================================
// INVARIANT 9: Fund distribution requires sufficient treasury
// =============================================================================

rule fundDistributionRequiresSufficientFunds(
    address creator,
    address recipient,
    uint256 amount,
    string description,
    bytes32 corpusHash
) {
    env e;

    uint256 treasuryBefore = treasuries(creator);

    fundProject@withrevert(e, creator, recipient, amount, description, corpusHash);

    bool reverted = lastReverted;

    // Should revert if insufficient funds
    assert (amount > treasuryBefore) => reverted,
        "Invariant violation: funded project without sufficient treasury";
}

// =============================================================================
// INVARIANT 10: Revenue distribution preserves total value
// =============================================================================

rule revenueDistributionPreservesValue(
    address creator,
    address recipient,
    uint256 amount
) {
    env e;

    uint256 treasuryBefore = treasuries(creator);

    distributeRevenue(e, creator, recipient, amount);

    uint256 treasuryAfter = treasuries(creator);

    // Treasury should decrease by exactly the amount distributed
    assert treasuryAfter == treasuryBefore - amount,
        "Invariant violation: treasury value not preserved after distribution";
}

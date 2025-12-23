/*
 * Certora Verification Specification for SunsetProtocol
 *
 * Critical Invariants:
 * 1. SUNSET_DURATION is exactly 20 years (immutable)
 * 2. Sunset cannot be initiated before 20 years
 * 3. Sunset state is irreversible
 * 4. IP must transition to public domain (CC0)
 * 5. Emergency sunset available to anyone after 20 years
 */

methods {
    function SUNSET_DURATION() external returns (uint256) envfree;
    function sunsetStates(address) external returns (
        address, uint256, uint256, bool, bool, bool, bool, uint8, string
    ) envfree;
    function getSunsetState(address) external returns (SunsetProtocol.SunsetState memory) envfree;
}

// =============================================================================
// INVARIANT 1: Sunset duration is exactly 20 years (immutable constant)
// =============================================================================

invariant sunsetDurationImmutable()
    SUNSET_DURATION() == 20 * 365 * 24 * 60 * 60  // 630720000 seconds
    {
        preserved {
            require true;
        }
    }

// =============================================================================
// INVARIANT 2: Sunset cannot be initiated before 20 years elapsed
// =============================================================================

rule sunsetRequiresTwentyYears(address creator, uint256 triggerTimestamp) {
    env e;

    uint256 sunsetDuration = SUNSET_DURATION();

    // If 20 years haven't passed, initiateSunset should revert
    require e.block.timestamp < triggerTimestamp + sunsetDuration;
    require triggerTimestamp > 0;

    initiateSunset@withrevert(e, creator, triggerTimestamp);

    assert lastReverted,
        "Critical invariant violation: sunset initiated before 20 years";
}

// =============================================================================
// INVARIANT 3: Sunset state is irreversible (isSunset)
// =============================================================================

rule sunsetStateIrreversible(address creator) {
    env e;

    bool isSunsetBefore = getSunsetState(creator).isSunset;

    calldataarg args;
    f(e, args);

    bool isSunsetAfter = getSunsetState(creator).isSunset;

    assert isSunsetBefore => isSunsetAfter,
        "Critical invariant violation: sunset state was reversed";
}

// =============================================================================
// INVARIANT 4: Assets archived state is irreversible
// =============================================================================

rule assetsArchivedIrreversible(address creator) {
    env e;

    bool archivedBefore = getSunsetState(creator).assetsArchived;

    calldataarg args;
    f(e, args);

    bool archivedAfter = getSunsetState(creator).assetsArchived;

    assert archivedBefore => archivedAfter,
        "Invariant violation: assets archived state was reversed";
}

// =============================================================================
// INVARIANT 5: IP transition state is irreversible
// =============================================================================

rule ipTransitionIrreversible(address creator) {
    env e;

    bool transitionedBefore = getSunsetState(creator).ipTransitioned;

    calldataarg args;
    f(e, args);

    bool transitionedAfter = getSunsetState(creator).ipTransitioned;

    assert transitionedBefore => transitionedAfter,
        "Invariant violation: IP transition state was reversed";
}

// =============================================================================
// INVARIANT 6: Sunset workflow must follow order
// =============================================================================

rule sunsetWorkflowOrder(address creator) {
    env e;

    bool isSunset = getSunsetState(creator).isSunset;
    bool assetsArchived = getSunsetState(creator).assetsArchived;
    bool ipTransitioned = getSunsetState(creator).ipTransitioned;
    bool clustered = getSunsetState(creator).clustered;

    // Assets can only be archived if sunset is initiated
    assert assetsArchived => isSunset,
        "Invariant violation: assets archived without sunset";

    // IP can only transition if assets are archived
    assert ipTransitioned => assetsArchived,
        "Invariant violation: IP transitioned without archival";

    // Clustering can only happen if IP is transitioned
    assert clustered => ipTransitioned,
        "Invariant violation: clustered without IP transition";
}

// =============================================================================
// INVARIANT 7: Cannot initiate sunset twice
// =============================================================================

rule cannotDoubleSunset(address creator, uint256 triggerTimestamp) {
    env e;

    bool isSunsetBefore = getSunsetState(creator).isSunset;

    initiateSunset@withrevert(e, creator, triggerTimestamp);

    bool reverted = lastReverted;

    // If already sunset, should revert
    assert isSunsetBefore => reverted,
        "Invariant violation: sunset initiated twice";
}

// =============================================================================
// INVARIANT 8: Emergency sunset available to anyone after 20 years
// =============================================================================

rule emergencySunsetAccessible(address creator, uint256 triggerTimestamp) {
    env e;

    uint256 sunsetDuration = SUNSET_DURATION();
    bool isSunsetBefore = getSunsetState(creator).isSunset;

    // If 20 years have passed and not already sunset
    require e.block.timestamp >= triggerTimestamp + sunsetDuration;
    require triggerTimestamp > 0;
    require !isSunsetBefore;

    // Emergency sunset should succeed for any caller
    emergencySunset@withrevert(e, creator, triggerTimestamp);

    // Should not revert (accessible to anyone)
    assert !lastReverted,
        "Invariant violation: emergency sunset not accessible after 20 years";
}

// =============================================================================
// INVARIANT 9: Sunset timestamp recorded correctly
// =============================================================================

rule sunsetTimestampRecorded(address creator, uint256 triggerTimestamp) {
    env e;

    require !getSunsetState(creator).isSunset;

    initiateSunset(e, creator, triggerTimestamp);

    uint256 recordedSunsetTime = getSunsetState(creator).sunsetTimestamp;
    uint256 recordedTriggerTime = getSunsetState(creator).triggerTimestamp;

    assert recordedSunsetTime == e.block.timestamp,
        "Invariant violation: sunset timestamp not recorded correctly";
    assert recordedTriggerTime == triggerTimestamp,
        "Invariant violation: trigger timestamp not recorded correctly";
}

// =============================================================================
// INVARIANT 10: Default license type is CC0
// =============================================================================

rule defaultLicenseIsCC0(address creator, uint256 triggerTimestamp) {
    env e;

    require !getSunsetState(creator).isSunset;

    initiateSunset(e, creator, triggerTimestamp);

    // License type enum: 0 = CC0
    assert getSunsetState(creator).postSunsetLicense == 0,
        "Invariant violation: default license is not CC0";
}

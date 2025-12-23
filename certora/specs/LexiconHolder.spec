/*
 * Certora Verification Specification for LexiconHolder
 *
 * Critical Invariants:
 * 1. Frozen corpus cannot be unfrozen
 * 2. Frozen corpus hash cannot be changed
 * 3. LexiconHolder has NO execution authority (read-only for corpus)
 * 4. Semantic indices can only be created for frozen corpora
 */

methods {
    function corpusRegistry(address) external returns (
        bytes32, string, uint256, uint256, bool
    ) envfree;
    function getCorpus(address) external returns (LexiconHolder.CorpusEntry memory) envfree;
    function legacyClusterAssignments(address) external returns (bytes32) envfree;
}

// =============================================================================
// INVARIANT 1: Frozen corpus remains frozen (irreversibility)
// =============================================================================

rule frozenCorpusCannotBeUnfrozen(address creator) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;

    calldataarg args;
    f(e, args);

    bool frozenAfter = getCorpus(creator).isFrozen;

    assert frozenBefore => frozenAfter,
        "Critical invariant violation: frozen corpus was unfrozen";
}

// =============================================================================
// INVARIANT 2: Frozen corpus hash cannot be modified
// =============================================================================

rule frozenCorpusHashImmutable(address creator) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;
    bytes32 hashBefore = getCorpus(creator).corpusHash;

    calldataarg args;
    f(e, args);

    bytes32 hashAfter = getCorpus(creator).corpusHash;

    // If corpus was frozen, hash must not change
    assert frozenBefore => (hashBefore == hashAfter),
        "Critical invariant violation: frozen corpus hash was modified";
}

// =============================================================================
// INVARIANT 3: Frozen corpus time window cannot be modified
// =============================================================================

rule frozenCorpusTimeWindowImmutable(address creator) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;
    uint256 startYearBefore = getCorpus(creator).startYear;
    uint256 endYearBefore = getCorpus(creator).endYear;

    calldataarg args;
    f(e, args);

    uint256 startYearAfter = getCorpus(creator).startYear;
    uint256 endYearAfter = getCorpus(creator).endYear;

    assert frozenBefore => (startYearBefore == startYearAfter),
        "Critical invariant violation: frozen corpus start year was modified";
    assert frozenBefore => (endYearBefore == endYearAfter),
        "Critical invariant violation: frozen corpus end year was modified";
}

// =============================================================================
// INVARIANT 4: Cannot freeze already frozen corpus
// =============================================================================

rule cannotRefreezeCorpus(
    address creator,
    bytes32 corpusHash,
    string storageURI,
    uint256 startYear,
    uint256 endYear
) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;

    freezeCorpus@withrevert(e, creator, corpusHash, storageURI, startYear, endYear);

    bool reverted = lastReverted;

    // If already frozen, should revert
    assert frozenBefore => reverted,
        "Invariant violation: corpus was refrozen";
}

// =============================================================================
// INVARIANT 5: Semantic indices require frozen corpus
// =============================================================================

rule semanticIndexRequiresFrozenCorpus(
    address creator,
    string keyword,
    string[] citations,
    uint256[] relevanceScores
) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;

    createSemanticIndex@withrevert(e, creator, keyword, citations, relevanceScores);

    bool reverted = lastReverted;

    // If corpus not frozen, should revert
    assert !frozenBefore => reverted,
        "Invariant violation: semantic index created without frozen corpus";
}

// =============================================================================
// INVARIANT 6: Time window must be valid (endYear > startYear)
// =============================================================================

rule timeWindowValid(
    address creator,
    bytes32 corpusHash,
    string storageURI,
    uint256 startYear,
    uint256 endYear
) {
    env e;

    freezeCorpus@withrevert(e, creator, corpusHash, storageURI, startYear, endYear);

    bool reverted = lastReverted;

    // Should revert if endYear <= startYear
    assert (endYear <= startYear) => reverted,
        "Invariant violation: invalid time window accepted";
}

// =============================================================================
// INVARIANT 7: Legacy cluster assignment requires frozen corpus
// =============================================================================

rule clusterAssignmentRequiresFrozenCorpus(address creator, bytes32 clusterId) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;

    assignLegacyToCluster@withrevert(e, creator, clusterId);

    bool reverted = lastReverted;

    // If corpus not frozen, should revert
    assert !frozenBefore => reverted,
        "Invariant violation: legacy clustered without frozen corpus";
}

// =============================================================================
// INVARIANT 8: Corpus storage URI immutable after freeze
// =============================================================================

rule frozenCorpusURIImmutable(address creator) {
    env e;

    bool frozenBefore = getCorpus(creator).isFrozen;
    string uriBefore = getCorpus(creator).storageURI;

    calldataarg args;
    f(e, args);

    string uriAfter = getCorpus(creator).storageURI;

    // If frozen, URI must not change (string comparison is complex in CVL)
    // This is a simplified check - in practice would need hash comparison
    assert frozenBefore => (keccak256(uriBefore) == keccak256(uriAfter)),
        "Critical invariant violation: frozen corpus URI was modified";
}

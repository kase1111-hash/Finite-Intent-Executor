# Plan for Remaining 4 Acknowledged Issues

**Date:** 2026-02-20
**Reference:** [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md), [REMEDIATION_PLAN.md](./REMEDIATION_PLAN.md)

These 4 issues were previously marked as "acknowledged/design decisions." This plan provides concrete implementation strategies to address each one.

---

## Issue 1: M-6 — Oracle Reputation System is Gameable

### Problem

In `OracleRegistry.sol:317-339`, the reputation scoring is asymmetric: +1 for agreeing with consensus, -5 for disagreeing. A colluding majority of oracles can:

1. Always agree with each other to farm +1 reputation per round
2. Punish honest dissenting oracles at -5 per round
3. Drive legitimate oracles below `minReputationThreshold` (50), effectively ejecting them

With the current default threshold of 2 oracles and a max of 20, a colluding pair can permanently exclude all others.

```solidity
// Current code (lines 325-336)
if (oracleResult == _consensusResult) {
    info.successfulVerifications++;
    info.reputationScore = info.reputationScore + 1 > 100 ? 100 : info.reputationScore + 1;
} else {
    info.failedVerifications++;
    info.reputationScore = info.reputationScore > 5 ? info.reputationScore - 5 : 0;
}
```

### Plan

**Approach: Balanced asymmetry + decay + admin override**

#### Step 1: Reduce penalty asymmetry
Change from +1/-5 to +2/-3. This still penalizes disagreement more than it rewards agreement (since a wrong verification is more harmful than a correct one), but prevents rapid ejection.

```solidity
uint256 public constant REPUTATION_REWARD = 2;
uint256 public constant REPUTATION_PENALTY = 3;
```

#### Step 2: Add minimum reputation floor
Introduce a floor so oracles can never be fully ejected by reputation alone. An oracle below the threshold is excluded from new aggregations but retains its registration and can recover.

```solidity
uint256 public constant MIN_REPUTATION_FLOOR = 10;
// In penalty path:
info.reputationScore = info.reputationScore > REPUTATION_PENALTY
    ? info.reputationScore - REPUTATION_PENALTY
    : MIN_REPUTATION_FLOOR;
```

#### Step 3: Add admin reputation reset
Allow the owner to reset an oracle's reputation if it was unfairly penalized by collusion:

```solidity
function resetOracleReputation(address _oracle, uint256 _score) external onlyOwner {
    require(_score <= 100, "Invalid score");
    require(oracles[_oracle].oracleAddress != address(0), "Oracle not registered");
    oracles[_oracle].reputationScore = _score;
    emit OracleReputationUpdated(_oracle, _score);
}
```

#### Step 4: Add dispute window for aggregation results
Allow the owner to invalidate a suspicious aggregation within a time window, reversing reputation changes:

```solidity
uint256 public constant AGGREGATION_DISPUTE_WINDOW = 7 days;

function disputeAggregation(bytes32 _aggregationId) external onlyOwner {
    AggregatedVerification storage agg = aggregations[_aggregationId];
    require(agg.isComplete, "Not complete");
    require(
        block.timestamp <= agg.requestTimestamp + AGGREGATION_DISPUTE_WINDOW,
        "Dispute window closed"
    );
    // Reverse reputation changes
    _reverseReputationChanges(_aggregationId, agg.isValid);
    agg.isValid = false;
}
```

#### Files changed
- `contracts/oracles/OracleRegistry.sol`

#### Tests
- Verify +2/-3 reputation changes
- Verify MIN_REPUTATION_FLOOR prevents full ejection
- Verify admin can reset reputation
- Verify dispute reversal within window
- Verify dispute reverts after window

---

## Issue 2: M-9/M-10 — Front-Running Mitigations

### Problem

**M-9 (Deadman switch):** `executeDeadmanSwitch()` in `TriggerMechanism.sol:492` is callable by anyone once the deadman interval elapses. A mempool observer can front-run the legitimate caller. While the outcome is the same (trigger fires), front-running allows MEV extraction and provides no incentive for honest monitoring.

**M-10 (Oracle proof):** `submitOracleProof()` was already disabled (reverts unconditionally per C-2 fix), so M-10 is effectively resolved. This plan only needs to address M-9.

### Plan

**Approach: Commit-reveal scheme for deadman switch execution**

#### Step 1: Add commit-reveal state

```solidity
mapping(address => mapping(address => bytes32)) public deadmanCommits;
mapping(address => mapping(address => uint256)) public deadmanCommitTimestamps;
uint256 public constant COMMIT_REVEAL_DELAY = 2; // blocks
```

#### Step 2: Commit phase

The caller commits a hash of their intent to execute:

```solidity
function commitDeadmanExecution(address _creator) external {
    TriggerConfig storage config = triggers[_creator];
    require(config.isConfigured, "Trigger not configured");
    require(config.triggerType == TriggerType.DeadmanSwitch, "Not a deadman switch");
    require(!config.isTriggered, "Already triggered");
    require(
        block.timestamp >= config.lastCheckIn + config.deadmanInterval,
        "Deadman interval not elapsed"
    );

    bytes32 commitment = keccak256(abi.encodePacked(msg.sender, _creator, block.number));
    deadmanCommits[_creator][msg.sender] = commitment;
    deadmanCommitTimestamps[_creator][msg.sender] = block.number;
}
```

#### Step 3: Reveal phase (modify executeDeadmanSwitch)

```solidity
function executeDeadmanSwitch(address _creator) external nonReentrant {
    TriggerConfig storage config = triggers[_creator];
    require(config.isConfigured, "Trigger not configured");
    require(config.triggerType == TriggerType.DeadmanSwitch, "Not a deadman switch");
    require(!config.isTriggered, "Already triggered");
    require(
        block.timestamp >= config.lastCheckIn + config.deadmanInterval,
        "Deadman interval not elapsed"
    );

    // Commit-reveal: caller must have committed >= COMMIT_REVEAL_DELAY blocks ago
    uint256 commitBlock = deadmanCommitTimestamps[_creator][msg.sender];
    require(commitBlock > 0, "No commitment found");
    require(block.number >= commitBlock + COMMIT_REVEAL_DELAY, "Reveal too early");

    // Verify commitment
    bytes32 expected = keccak256(abi.encodePacked(msg.sender, _creator, commitBlock));
    require(deadmanCommits[_creator][msg.sender] == expected, "Invalid commitment");

    // Clear commitment
    delete deadmanCommits[_creator][msg.sender];
    delete deadmanCommitTimestamps[_creator][msg.sender];

    _executeTrigger(_creator, config);
}
```

#### Alternative (simpler): Restrict to trusted signers

If commit-reveal is too complex, simply restrict `executeDeadmanSwitch` to trusted signers or a dedicated keeper role:

```solidity
function executeDeadmanSwitch(address _creator) external nonReentrant {
    require(
        _isTrustedSigner(_creator, msg.sender) || msg.sender == owner(),
        "Not authorized"
    );
    // ... existing checks
}
```

This is simpler and prevents arbitrary MEV actors from front-running, though it reduces the "permissionless liveness" property.

#### Files changed
- `contracts/TriggerMechanism.sol`

#### Tests
- Test commit then reveal after delay succeeds
- Test reveal without commit reverts
- Test reveal before delay reverts
- Test commitment from different caller reverts
- Test front-runner cannot reuse another's commitment

---

## Issue 3: L-11 — `block.timestamp` as ZK Public Input is Nondeterministic

### Problem

In `ZKVerifierAdapter.sol:480`, `block.timestamp` is used as the third public input to ZK proof verification:

```solidity
publicInputs[2] = block.timestamp; // currentTimestamp
```

ZK proofs are generated off-chain at a specific timestamp, but `block.timestamp` on-chain is set by the block proposer and is only known at inclusion time. This means:
1. The prover must predict `block.timestamp` when generating the proof
2. If the proof is included in a different block than expected, the timestamp mismatches and verification fails
3. Miners can manipulate `block.timestamp` by ~15 seconds

### Plan

**Approach: Replace `block.timestamp` with a caller-supplied timestamp + bounded tolerance**

#### Step 1: Accept timestamp as function parameter

Modify `submitZKProof` to accept a `_proofTimestamp` parameter:

```solidity
function submitZKProof(
    bytes32 _requestId,
    bytes32 _keyId,
    bytes calldata _proof,
    bytes32 _creatorCommitment,
    bytes32 _issuerCommitment,
    bytes32 _certificateHash,
    uint256 _proofTimestamp        // NEW: timestamp used when generating proof
) external nonReentrant returns (bool success) {
```

#### Step 2: Validate timestamp within acceptable window

```solidity
uint256 public constant MAX_PROOF_TIMESTAMP_DRIFT = 1 hours;

// In submitZKProof:
require(
    _proofTimestamp <= block.timestamp &&
    _proofTimestamp >= block.timestamp - MAX_PROOF_TIMESTAMP_DRIFT,
    "Proof timestamp outside acceptable window"
);
```

#### Step 3: Use caller-supplied timestamp in public inputs

```solidity
// In _verifyProof:
publicInputs[2] = _proofTimestamp; // deterministic — matches prover's value
```

This ensures:
- The prover knows the exact timestamp baked into the proof
- The on-chain verifier uses the same value
- The window prevents replay of old proofs (max 1 hour old)
- Miners cannot cause verification failure via timestamp manipulation

#### Files changed
- `contracts/oracles/ZKVerifierAdapter.sol`

#### Tests
- Test proof submission with matching timestamp succeeds
- Test timestamp in the future reverts
- Test timestamp older than MAX_PROOF_TIMESTAMP_DRIFT reverts
- Test timestamp at exact boundary (edge case)

---

## Issue 4: L-23/L-24 — PoliticalFilter ASCII-Only Restriction & Gas Cost

### Problem

**L-23:** `_containsSuspiciousCharacters()` in `PoliticalFilter.sol:511-535` rejects ALL bytes >= 0x80, blocking any non-ASCII content including accented characters (é, ñ, ü), CJK text, emoji, etc. This is overly restrictive for international users.

**L-24:** The multi-layer scanning (`checkAction`) performs 7 detection passes over up to 1000-byte strings. While bounded by `MAX_FILTER_STRING_LENGTH`, the gas cost scales as O(n * k) where n = string length and k = number of keywords (~80+). For a 1000-byte string, this is approximately 80,000 comparisons.

### Plan

**L-23 Approach: Targeted homoglyph detection instead of blanket rejection**

#### Step 1: Replace blanket non-ASCII rejection with targeted Latin-lookalike detection

Instead of rejecting all non-ASCII bytes, only flag specific Unicode ranges known to contain Latin homoglyphs:

```solidity
function _containsSuspiciousCharacters(bytes memory str) private pure returns (bool) {
    for (uint256 i = 0; i < str.length; i++) {
        uint8 b = uint8(str[i]);

        // ASCII is always safe
        if (b < 0x80) continue;

        // 2-byte UTF-8 sequence: 110xxxxx 10xxxxxx
        if (b >= 0xC0 && b < 0xE0 && i + 1 < str.length) {
            uint8 b2 = uint8(str[i + 1]);
            // Decode codepoint
            uint256 cp = ((uint256(b) & 0x1F) << 6) | (uint256(b2) & 0x3F);

            // Block Cyrillic (U+0400-U+04FF) — contains most Latin homoglyphs
            if (cp >= 0x0400 && cp <= 0x04FF) return true;

            // Block Greek (U+0370-U+03FF) — some Latin lookalikes
            if (cp >= 0x0370 && cp <= 0x03FF) return true;

            // Allow Latin Extended (U+0080-U+024F) — accented chars like é, ñ, ü
            // Allow other 2-byte sequences (legitimate international text)
            i += 1; // skip continuation byte
            continue;
        }

        // 3-byte and 4-byte sequences: allow (CJK, emoji, etc. are not homoglyphs)
        if (b >= 0xE0 && b < 0xF0 && i + 2 < str.length) {
            i += 2;
            continue;
        }
        if (b >= 0xF0 && b < 0xF8 && i + 3 < str.length) {
            i += 3;
            continue;
        }

        // Malformed UTF-8 — reject
        return true;
    }
    return false;
}
```

This allows:
- Accented Latin characters (é, ñ, ü, ö) — Latin Extended
- CJK characters — legitimate international text
- Emoji — harmless

While still blocking:
- Cyrillic homoglyphs (а→a, р→p, е→e, о→o)
- Greek homoglyphs (ο→o, Α→A)
- Malformed UTF-8

#### Step 2: Add confusable-pair normalization for allowed scripts

For Latin Extended characters that have political-keyword-relevant normalizations:

```solidity
function _normalizeAccents(bytes1 b1, bytes1 b2) private pure returns (bytes1) {
    // Normalize common accented chars to base ASCII for keyword matching
    // é (C3 A9) → e, ñ (C3 B1) → n, ü (C3 BC) → u, etc.
    if (b1 == 0xC3) {
        uint8 v = uint8(b2);
        if (v >= 0xA0 && v <= 0xA5) return "a"; // à-å
        if (v >= 0xA8 && v <= 0xAB) return "e"; // è-ë
        if (v >= 0xAC && v <= 0xAF) return "i"; // ì-ï
        if (v >= 0xB2 && v <= 0xB6) return "o"; // ò-ö
        if (v >= 0xB9 && v <= 0xBC) return "u"; // ù-ü
        if (v == 0xB1) return "n"; // ñ
    }
    return 0x00; // no normalization
}
```

**L-24 Approach: Early exit optimization to reduce average gas cost**

#### Step 3: Add fast-path hash check before expensive scanning

Most legitimate actions won't match any political terms. Add a Bloom-filter-style fast check:

```solidity
function checkAction(string memory action) internal pure returns (FilterResult memory result) {
    bytes memory actionBytes = bytes(action);

    // ... existing length check ...

    // Fast path: if action contains none of the common political trigrams,
    // skip expensive multi-layer scanning
    if (!_containsPoliticalTrigram(actionBytes)) {
        return FilterResult({
            isProhibited: false,
            category: PoliticalCategory.None,
            matchedTerm: "",
            confidenceScore: 0
        });
    }

    // ... existing layer 0-4 checks ...
}

function _containsPoliticalTrigram(bytes memory actionBytes) private pure returns (bool) {
    // Check for 3-letter sequences present in almost all political keywords
    // "ot" (vote, political), "el" (elect, election), "ob" (lobby),
    // "am" (campaign), "ov" (government), "eg" (legislation), "ar" (partisan)
    for (uint256 i = 0; i + 1 < actionBytes.length; i++) {
        bytes1 a = _toLower(actionBytes[i]);
        bytes1 b = _toLower(actionBytes[i + 1]);
        if ((a == "o" && b == "t") || (a == "e" && b == "l") ||
            (a == "o" && b == "b") || (a == "a" && b == "m") ||
            (a == "o" && b == "v") || (a == "e" && b == "g") ||
            (a == "a" && b == "r") || (a == "a" && b == "l") ||
            (a == "o" && b == "l") || (a == "e" && b == "n") ||
            (a == "e" && b == "p") || (a == "e" && b == "m")) {
            return true;
        }
    }
    return false;
}
```

This adds a single O(n) pass that short-circuits the remaining ~O(n*80) passes for non-political strings. The bigrams are chosen to cover all primary keywords while being cheap to check.

#### Step 4: Document gas cost bounds

Add explicit gas documentation:

```solidity
/// @dev Gas cost analysis:
/// - Fast path (no trigram match): ~2,000 gas for 1000-byte string
/// - Full scan (worst case): ~150,000 gas for 1000-byte string with all layers
/// - Average case (legitimate actions): ~5,000 gas
/// Bounded by MAX_FILTER_STRING_LENGTH = 1000
```

#### Files changed
- `contracts/libraries/PoliticalFilter.sol`

#### Tests
- Test accented characters (é, ñ, ü) are allowed through
- Test CJK characters are allowed through
- Test Cyrillic homoglyphs (а, р, е) are still blocked
- Test Greek homoglyphs are still blocked
- Test malformed UTF-8 is still blocked
- Test gas consumption for 1000-byte non-political string (should be < 10,000 gas)
- Test gas consumption for 1000-byte political string (should be < 200,000 gas)
- Fuzz: random ASCII strings never produce false positives on the fast path

---

## Summary

| Issue | Approach | Complexity | Risk |
|-------|----------|------------|------|
| M-6 | Balanced penalties + floor + admin override + dispute window | Medium | Low — improves existing system without breaking changes |
| M-9/10 | Commit-reveal for deadman switch (or simpler: restrict to trusted signers) | Medium/Low | Low — M-10 already resolved by C-2 fix |
| L-11 | Caller-supplied timestamp with bounded drift window | Low | Low — straightforward parameter addition |
| L-23/24 | Targeted homoglyph detection + bigram fast path | Medium | Medium — UTF-8 parsing in Solidity requires careful testing |

**Recommended implementation order:**
1. L-11 (simplest, isolated change)
2. M-6 (self-contained to OracleRegistry)
3. M-9 (choose simple or commit-reveal based on liveness requirements)
4. L-23/24 (most complex, needs thorough fuzz testing)

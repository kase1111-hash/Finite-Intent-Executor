# Security Audit Report — Finite Intent Executor (FIE)

**Audit Date:** 2026-02-20
**Auditor:** Automated Security Review (Claude Code)
**Scope:** Full codebase — smart contracts, frontend, scripts, CI/CD, dependencies
**Solidity Version:** ^0.8.20
**OpenZeppelin Version:** 5.4.0
**Commit:** 5e42f8d (branch `claude/security-audit-review-1x7cO`)

---

## Executive Summary

This report presents a comprehensive security audit of the Finite Intent Executor (FIE) codebase covering 17 Solidity contracts (~6,400 LOC), a React frontend, deployment scripts, CI configuration, and supporting infrastructure. The audit identified **52 smart contract findings** (3 Critical, 4 High, 22 Medium, 23 Low) plus **19 infrastructure/frontend findings** across credential management, access control, input validation, and operational security.

The core contract architecture is well-structured with appropriate use of OpenZeppelin primitives, consistent CEI patterns, and bounded array operations. However, significant risks remain around single-key privilege concentration, non-functional ZK verification (PlonkVerifier), and unprotected oracle trust paths.

**This system is NOT ready for mainnet deployment.** The critical findings must be addressed first.

---

## Table of Contents

1. [Findings Summary](#findings-summary)
2. [Critical Findings](#critical-findings)
3. [High Findings](#high-findings)
4. [Medium Findings](#medium-findings)
5. [Low Findings](#low-findings)
6. [Infrastructure & Frontend Findings](#infrastructure--frontend-findings)
7. [What Passed Review](#what-passed-review)
8. [Remediation Priority](#remediation-priority)

---

## Findings Summary

### Smart Contracts

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 4 |
| MEDIUM | 22 |
| LOW | 23 |
| **Total** | **52** |

### Infrastructure & Frontend

| Category | Count |
|----------|-------|
| Credential & Secret Management | 4 |
| Frontend Security | 6 |
| Scripts & Deployment | 5 |
| CI/CD & Dependencies | 4 |
| **Total** | **19** |

---

## Critical Findings

### C-1: PlonkVerifier Is a Non-Functional Placeholder

**Location:** `contracts/verifiers/PlonkVerifier.sol:546-604`
**Severity:** CRITICAL
**Status:** Open

Four internal verification functions return trivial values instead of performing real PLONK verification:

| Function | Line | Behavior |
|----------|------|----------|
| `_computeLinearization` | 546 | Returns single scalar multiplication instead of full linearization polynomial |
| `_computeBatchedCommitment` | 564 | Returns input unchanged |
| `_computeBatchedEvaluation` | 577 | Returns `_proof.aEval` directly |
| `_pairingCheck` | 589 | Performs simplified 2-pair check instead of full KZG verification |

Any structurally valid proof passes verification. This means the PLONK path in ZKVerifierAdapter provides **zero cryptographic assurance**.

**Note:** The Groth16Verifier at `contracts/verifiers/Groth16Verifier.sol:261-286` is correctly implemented with a proper 4-pair pairing check using BN254 precompiles.

**Recommendation:** Either complete the PlonkVerifier implementation or disable PLONK key registration entirely in ZKVerifierAdapter. Do not ship a verifier that accepts arbitrary proofs.

---

### C-2: Direct Oracle Mode Accepts Any Non-Empty Bytes as Proof

**Location:** `contracts/TriggerMechanism.sol:532-547`
**Severity:** CRITICAL
**Status:** Open (deprecation warning present but function callable)

```solidity
function submitOracleProof(address _creator, bytes memory _proof) external {
    require(_proof.length > 0, "Proof data required");
    // WARNING: Proof is NOT cryptographically verified in direct oracle mode.
    _executeTrigger(_creator, config);
}
```

A single compromised oracle address can fire any creator's entire posthumous intent irreversibly. The proof bytes are never validated — any non-empty payload triggers execution. Deprecation NatSpec warnings exist (lines 524-531) but the function remains fully callable.

**Recommendation:** Remove `submitOracleProof` entirely or add a `deprecated` modifier that reverts. If retained for testing, gate behind a `testMode` flag that is permanently disabled in production deployments.

---

### C-3: Single Deployer Key Controls All 13 Contracts' Admin Roles

**Severity:** CRITICAL
**Status:** Open (architectural)

Every constructor grants maximum privileges to `msg.sender`:

| Contract | Roles Granted | Line |
|----------|--------------|------|
| ExecutionAgent | `DEFAULT_ADMIN_ROLE` + `EXECUTOR_ROLE` | 121-123 |
| IPToken | `DEFAULT_ADMIN_ROLE` + `MINTER_ROLE` + `EXECUTOR_ROLE` | 80-83 |
| LexiconHolder | `DEFAULT_ADMIN_ROLE` + `INDEXER_ROLE` | 75-77 |
| SunsetProtocol | `DEFAULT_ADMIN_ROLE` + `SUNSET_OPERATOR_ROLE` | 90-92 |
| 9 Ownable contracts | `owner()` | constructors |

Compromise of this single key yields:
- Unlimited token minting via `MINTER_ROLE`
- Arbitrary action execution via forged corpus resolution (`INDEXER_ROLE`)
- Complete treasury drainage via `EXECUTOR_ROLE`
- Oracle result forgery and sunset manipulation
- Placeholder ZK verification enablement
- Royalty redirection

**Recommendation:** Deploy all contracts behind a multisig wallet (e.g., Gnosis Safe) with a timelock. Separate operational roles from admin roles. Use a hardware wallet for the deployer key.

---

## High Findings

### H-1: ZKVerifierAdapter Falls Back to Non-Cryptographic Placeholder

**Location:** `contracts/oracles/ZKVerifierAdapter.sol`
**Severity:** HIGH

Three code paths silently fall back to `_verifyPlaceholder()`:

| Path | Line | Condition |
|------|------|-----------|
| Groth16 | 499 | Verifier address not set |
| PLONK | 525 | Verifier address not set |
| STARK | 481-484 | Always (not implemented) |

The placeholder at lines 548-587 is gated by `require(allowPlaceholderVerification)` (default `false`), but the owner can flip it at any time via `setAllowPlaceholderVerification(true)` (line 208). Once enabled, only proof byte length is checked (256 for Groth16, 1152 for PLONK).

**Recommendation:** Make `allowPlaceholderVerification` immutable or remove the setter. The owner should not be able to downgrade verification at runtime.

---

### H-2: `ExecutionAgent.activateSunset()` Has No Access Control

**Location:** `contracts/ExecutionAgent.sol:349-359`
**Severity:** HIGH

Anyone can call `activateSunset()` after 20 years. It sets `isSunset[_creator] = true` directly, bypassing the entire SunsetProtocol lifecycle: asset archiving, IP transition to public domain, legacy clustering, and completion. The SunsetProtocol's multi-step workflow (`contracts/SunsetProtocol.sol:103-240`) is circumvented entirely.

**Recommendation:** Add a `SUNSET_ROLE` requirement restricting calls to the SunsetProtocol contract address. The SunsetProtocol should be the only entity that can mark a creator as sunset.

---

### H-3: All Admin/Operator Roles Concentrate in the Deployer

**Severity:** HIGH

Operational extension of C-3. Even without key compromise, a single human controlling all roles defeats the purpose of role-based access control. The deployer simultaneously holds every permission in the system.

**Recommendation:** After deployment, renounce unnecessary roles and distribute operational roles to separate addresses controlled by different entities or a multisig.

---

### H-4: INDEXER_ROLE Is the Trust Root for All Execution Authorization

**Location:** `contracts/LexiconHolder.sol:145-164`
**Severity:** HIGH

`submitResolution()` accepts arbitrary confidence scores (0-100) for any creator and query, and overwrites existing resolutions without restriction. `ExecutionAgent.executeAction()` (line 177-184) gates every action on `confidence >= 95` from `resolveAmbiguity()`.

The indexer alone decides what passes and what fails. There is no multi-party check, no staleness validation, and no commit-reveal scheme. A compromised or malicious indexer can authorize any action or block any legitimate one.

**Recommendation:** Add commit-reveal for resolution submissions, enforce staleness checks (reject resolutions older than N blocks), and require multisig for the INDEXER_ROLE address.

---

## Medium Findings

### Access Control (4)

| ID | Finding | Location |
|----|---------|----------|
| M-1 | `SunsetProtocol.emergencySunset()` permissionless by design — leaves sunset incomplete | SunsetProtocol.sol:299-325 |
| M-2 | 9 Ownable contracts lack `Ownable2Step` two-step transfer protection | All Ownable contracts |
| M-3 | ChainlinkAdapter owner auto-authorized as fulfillment operator | ChainlinkAdapter.sol:92 |
| M-4 | ZKVerifierAdapter owner can enable placeholder verification at any time | ZKVerifierAdapter.sol:208-211 |

### Oracle Manipulation (3)

| ID | Finding | Location |
|----|---------|----------|
| M-5 | Default consensus threshold is 1 — single oracle suffices | OracleRegistry.sol:58 |
| M-6 | Reputation gameable by colluding majority (+1 agree, -5 disagree) | OracleRegistry.sol:310-335 |
| M-7 | INDEXER_ROLE forges and overwrites resolution results without restriction | LexiconHolder.sol:145-164 |

### Unchecked Calls (1)

| ID | Finding | Location |
|----|---------|----------|
| M-8 | Single reverting oracle DoS-es entire `requestAggregatedVerification()` — no try/catch | OracleRegistry.sol:236-243 |

### Front-running (2)

| ID | Finding | Location |
|----|---------|----------|
| M-9 | Deadman switch trigger front-runnable | TriggerMechanism.sol:484-495 |
| M-10 | Direct oracle proof submission raceable | TriggerMechanism.sol:532-547 |

### Denial of Service (2)

| ID | Finding | Location |
|----|---------|----------|
| M-11 | Unbounded `creatorRequests` arrays in ChainlinkAdapter, ZKVerifierAdapter, UMAAdapter | ChainlinkAdapter.sol:187, ZKVerifierAdapter.sol:294, UMAAdapter.sol:238 |
| M-12 | Unbounded `keyIds` arrays in Groth16Verifier and PlonkVerifier | Groth16Verifier.sol:147, PlonkVerifier.sol:203 |

### Input Validation (3)

| ID | Finding | Location |
|----|---------|----------|
| M-13 | No zero-address check for `_recipient` in `fundProject` and `distributeRevenue` | ExecutionAgent.sol:257,314 |
| M-14 | No zero-address check for `_licensee` in `grantLicense` and `issueLicense` | IPToken.sol:141, ExecutionAgent.sol:212 |
| M-15 | `setRoyaltyInfo` allows zero-address recipient | IPToken.sol:232-244 |

### Missing Events (2)

| ID | Finding | Location |
|----|---------|----------|
| M-16 | `depositToTreasury` emits no event | ExecutionAgent.sol:302-304 |
| M-17 | `setRoyaltyInfo` emits no event | IPToken.sol:232-244 |

### Token Logic (1)

| ID | Finding | Location |
|----|---------|----------|
| M-18 | IPToken lacks transfer restriction for public-domain tokens — no `_update()` override | IPToken.sol:207-224 |

### PoliticalFilter Bypass (3)

| ID | Finding | Location |
|----|---------|----------|
| M-19 | ASCII obfuscation bypasses: digit substitution, punctuation insertion, leet speak | PoliticalFilter.sol:75-108 |
| M-20 | Misspelling coverage inherently incomplete — 31 entries, misses transpositions and phonetics | PoliticalFilter.sol:500-539 |
| M-21 | Party-specific terms (republican, democrat, conservative, liberal) are secondary keywords that do not block | PoliticalFilter.sol:145-148,262-274 |

### Dead Code (1)

| ID | Finding | Location |
|----|---------|----------|
| M-22 | ErrorHandler library entirely unused — 5 events, 20+ custom errors, helper functions never called | ErrorHandler.sol:1-412 |

---

## Low Findings

### Reentrancy (2)

| ID | Finding | Location | Mitigation |
|----|---------|----------|------------|
| L-1 | `depositToTreasury` lacks `nonReentrant` | ExecutionAgent.sol:302 | CEI pattern present |
| L-2 | `executeDeadmanSwitch`/`submitOracleProof` lack `nonReentrant` | TriggerMechanism.sol:484,532 | CEI pattern present |

### Access Control (2)

| ID | Finding | Location |
|----|---------|----------|
| L-3 | `disputeVerification` unrestricted | ChainlinkAdapter.sol:313 |
| L-4 | Trigger configs overwritable before triggering | TriggerMechanism.sol:151-377 |

### Precision (1)

| ID | Finding | Location |
|----|---------|----------|
| L-5 | Running average truncation can drop borderline confidence from 95 to 94 | OracleRegistry.sol:278 |

### Unchecked Calls (1)

| ID | Finding | Location |
|----|---------|----------|
| L-6 | ERC20 `approve` without reset in UMAAdapter | UMAAdapter.sol:317,395 |

### Front-running (1)

| ID | Finding | Location |
|----|---------|----------|
| L-7 | `completeOracleVerification`/`completeZKVerification` callable by anyone | TriggerMechanism.sol:309,411 |

### Denial of Service (3)

| ID | Finding | Location |
|----|---------|----------|
| L-8 | Unbounded `issuerList`/`issuersByJurisdiction` | TrustedIssuerRegistry.sol:152 |
| L-9 | Unbounded `creatorTokens` | IPToken.sol:127 |
| L-10 | Deactivated oracles remain in list | OracleRegistry.sol:141 |

### Oracle (1)

| ID | Finding | Location |
|----|---------|----------|
| L-11 | `block.timestamp` as ZK public input is nondeterministic | ZKVerifierAdapter.sol:474 |

### Input Validation (5)

| ID | Finding | Location |
|----|---------|----------|
| L-12 | No duplicate signer check | TriggerMechanism.sol:174 |
| L-13 | Zero-value deposit accepted | ExecutionAgent.sol:302 |
| L-14 | UMAAdapter constructor accepts zero addresses | UMAAdapter.sol:132 |
| L-15 | `captureIntent` allows overwrite | IntentCaptureModule.sol:80 |
| L-16 | `archiveAssets` allows duplicate entries | SunsetProtocol.sol:142 |

### Missing Events (3)

| ID | Finding | Location |
|----|---------|----------|
| L-17 | `signVersion` no event | IntentCaptureModule.sol:139 |
| L-18 | `completeSunset` no completion flag | SunsetProtocol.sol:231 |
| L-19 | `expireRequest` reuses fulfillment event | ChainlinkAdapter.sol:292 |

### Logic & Dead Code (3)

| ID | Finding | Location |
|----|---------|----------|
| L-20 | `revenueGenerated` overstated with multiple active licenses | IPToken.sol:185 |
| L-21 | `assetTransitioned` mapping unused | SunsetProtocol.sol:77 |
| L-22 | `tx.origin` in correlation ID | ErrorHandler.sol:209 |

### Filter (2)

| ID | Finding | Location |
|----|---------|----------|
| L-23 | All non-ASCII text rejected by homoglyph detector | PoliticalFilter.sol:470 |
| L-24 | Gas cost of multi-layer scanning for long strings | PoliticalFilter.sol:193 |

---

## Infrastructure & Frontend Findings

### Credential & Secret Management

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| I-1 | MEDIUM | `.env.example` contains placeholder private key pattern that may be copied verbatim | `.env.example` |
| I-2 | LOW | No `.env` gitignore verification in CI — relies on developer discipline | `.gitignore` |
| I-3 | LOW | Hardhat config reads `PRIVATE_KEY` from env without validation | `hardhat.config.js` |
| I-4 | INFO | No secrets scanning tool (e.g., git-secrets, trufflehog) configured in CI | `.github/workflows/ci.yml` |

### Frontend Security

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| I-5 | MEDIUM | No Content Security Policy (CSP) headers configured | `frontend/index.html` |
| I-6 | MEDIUM | RPC endpoint URLs hardcoded in frontend source (visible to users) | `frontend/src/context/Web3Context.jsx` |
| I-7 | LOW | No input sanitization on user-provided intent text before contract submission | `frontend/src/pages/IntentCapture.jsx` |
| I-8 | LOW | Error messages may leak contract addresses and internal state | `frontend/src/pages/*.jsx` |
| I-9 | LOW | No rate limiting on frontend RPC calls | `frontend/src/context/Web3Context.jsx` |
| I-10 | INFO | React development dependencies (devDependencies) not production-separated | `frontend/package.json` |

### Scripts & Deployment

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| I-11 | HIGH | Deploy script uses single private key for all contract deployments | `scripts/deploy.js` |
| I-12 | MEDIUM | No deployment verification step (contract source verification on explorer) | `scripts/deploy.js` |
| I-13 | MEDIUM | No role separation in deployment — deployer retains all roles post-deploy | `scripts/deploy.js` |
| I-14 | LOW | No deployment address registry / manifest for tracking deployed contracts | `scripts/` |
| I-15 | LOW | Missing network validation — script does not verify target network before deploy | `scripts/deploy.js` |

### CI/CD & Dependencies

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| I-16 | MEDIUM | No dependency audit step (`npm audit`) in CI pipeline | `.github/workflows/ci.yml` |
| I-17 | LOW | No Dependabot or Renovate configured for automated dependency updates | Repository root |
| I-18 | LOW | CI does not run Foundry fuzz tests — only Hardhat tests gated | `.github/workflows/ci.yml` |
| I-19 | INFO | No SAST (static analysis) tool integrated — Slither/Mythril not in CI | `.github/workflows/ci.yml` |

---

## What Passed Review

The following areas were verified as correctly implemented:

1. **Reentrancy protection on all ETH transfers** — CEI pattern + `nonReentrant` modifier on all four ETH-sending functions in ExecutionAgent and IPToken
2. **All `.call` return values checked** — `require(success, ...)` on every low-level call
3. **Solidity 0.8.20 overflow protection** — No `unchecked` blocks, no SafeMath needed
4. **Bounded loops on core arrays** — 12 different MAX constants enforced across all core contracts
5. **No flash loan attack surface** — No balance-dependent governance, pricing, or collateral
6. **Correct OpenZeppelin v5.x usage** — `_grantRole`, `Ownable(msg.sender)`, `SafeERC20`, proper ERC721 overrides
7. **Timestamp manipulation negligible** — Minimum durations are hours to years vs. 15-second manipulation window
8. **Groth16Verifier correctly implemented** — Proper 4-pair pairing check using BN254 precompiles at `Groth16Verifier.sol:261-286`
9. **IntentCaptureModule trigger access control** — `triggerIntent` correctly restricted to TriggerMechanism address
10. **No hardcoded secrets in source code** — `.env.example` uses placeholder format, no real keys committed
11. **`.gitignore` covers sensitive patterns** — `.env`, `node_modules`, build artifacts properly ignored
12. **SECURITY.md changelog transparency** — Unusually detailed and honest vulnerability history for an alpha project

---

## Remediation Priority

### Before Deployment (CRITICAL + HIGH) — Must Fix

| Priority | Action | Finding |
|----------|--------|---------|
| 1 | Complete PlonkVerifier implementation or permanently disable PLONK path | C-1 |
| 2 | Remove or permanently disable `submitOracleProof` direct mode | C-2 |
| 3 | Deploy all contracts behind multisig with timelock | C-3, H-3 |
| 4 | Add `SUNSET_ROLE` to `activateSunset()` restricting to SunsetProtocol | H-2 |
| 5 | Make `allowPlaceholderVerification` immutable or remove setter | H-1 |
| 6 | Protect INDEXER_ROLE with multisig; add commit-reveal or staleness checks | H-4 |
| 7 | Deploy using separate keys per role with hardware wallet signing | I-11 |

### Before Mainnet (MEDIUM) — Should Fix

| Priority | Action | Finding |
|----------|--------|---------|
| 8 | Add `try/catch` around oracle calls in aggregation | M-8 |
| 9 | Increase default consensus threshold to 2+ | M-5 |
| 10 | Add zero-address validation to all fund/license/royalty functions | M-13, M-14, M-15 |
| 11 | Add events to `depositToTreasury` and `setRoyaltyInfo` | M-16, M-17 |
| 12 | Migrate 9 Ownable contracts to `Ownable2Step` | M-2 |
| 13 | Bound all unbounded arrays (creatorRequests, keyIds) | M-11, M-12 |
| 14 | Add transfer restriction for public-domain IPTokens via `_update()` | M-18 |
| 15 | Strengthen PoliticalFilter against ASCII obfuscation and party-term bypass | M-19, M-20, M-21 |
| 16 | Adopt ErrorHandler custom errors or remove the library | M-22 |
| 17 | Add CSP headers and input sanitization to frontend | I-5, I-7 |
| 18 | Add `npm audit` and Slither/Mythril to CI pipeline | I-16, I-19 |
| 19 | Add post-deploy role separation script | I-13 |

### Best Practice (LOW) — Consider Fixing

| Priority | Action | Finding |
|----------|--------|---------|
| 20 | Add `nonReentrant` to `depositToTreasury` and trigger execution functions | L-1, L-2 |
| 21 | Add duplicate signer check and configuration lock guards | L-12, L-4 |
| 22 | Fix `revenueGenerated` proportional tracking | L-20 |
| 23 | Remove unused `assetTransitioned` mapping and `tx.origin` usage | L-21, L-22 |
| 24 | Add missing events (signVersion, completeSunset) | L-17, L-18, L-19 |
| 25 | Configure Dependabot/Renovate for automated dependency updates | I-17 |
| 26 | Add Foundry fuzz tests to CI pipeline | I-18 |

---

## Methodology

This audit was conducted using:
- **Manual code review** of all 17 Solidity contracts, frontend source, deployment scripts, and CI configuration
- **Static pattern analysis** for common vulnerability patterns (reentrancy, access control, integer overflow, front-running, DoS)
- **Credential scanning** across the full repository for hardcoded secrets, API keys, and private keys
- **Dependency review** of package.json and lock files for known vulnerabilities
- **Architecture analysis** for privilege escalation paths and trust boundary violations

### Files Reviewed

**Smart Contracts (17 files, ~6,400 LOC):**
- `contracts/IntentCaptureModule.sol` (198 lines)
- `contracts/TriggerMechanism.sol` (650 lines)
- `contracts/ExecutionAgent.sol` (438 lines)
- `contracts/LexiconHolder.sol` (499 lines)
- `contracts/SunsetProtocol.sol` (326 lines)
- `contracts/IPToken.sol` (290 lines)
- `contracts/libraries/PoliticalFilter.sol` (540 lines)
- `contracts/libraries/ErrorHandler.sol` (412 lines)
- `contracts/oracles/OracleRegistry.sol` (~380 lines)
- `contracts/oracles/ChainlinkAdapter.sol` (~450 lines)
- `contracts/oracles/ZKVerifierAdapter.sol` (~600 lines)
- `contracts/oracles/UMAAdapter.sol` (~440 lines)
- `contracts/oracles/TrustedIssuerRegistry.sol` (423 lines)
- `contracts/verifiers/Groth16Verifier.sol` (~610 lines)
- `contracts/verifiers/PlonkVerifier.sol` (~600 lines)

**Infrastructure:**
- `frontend/src/` — React 19 + Vite frontend
- `scripts/deploy.js` — Deployment script
- `hardhat.config.js` — Hardhat configuration
- `.github/workflows/ci.yml` — CI pipeline
- `.env.example` — Environment template
- `package.json` / `package-lock.json` — Dependencies

---

## Disclaimer

This audit was performed through automated analysis and manual code review. It does not guarantee the absence of vulnerabilities. A professional external audit by a specialized firm (OpenZeppelin, Trail of Bits, Spearbit, or equivalent) is strongly recommended before any mainnet deployment involving real funds.

---

*Report generated: 2026-02-20*

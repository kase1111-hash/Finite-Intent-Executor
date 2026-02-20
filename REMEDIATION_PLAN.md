# Remediation Plan — Finite Intent Executor Security Audit

**Created:** 2026-02-20
**Audit Reference:** [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)
**Total Findings:** 71 (52 smart contract + 19 infrastructure)
**Phases:** 4 phases, ordered by severity and dependency

---

## Phase 1: Critical + High Contract Fixes (7 findings)

All changes in this phase are **prerequisites for any deployment**. They address exploitable vulnerabilities that can cause irreversible harm.

### Step 1.1 — Disable PlonkVerifier PLONK path [C-1]

**File:** `contracts/oracles/ZKVerifierAdapter.sol`
**What:** Prevent PLONK key registration and verification since PlonkVerifier is a non-functional placeholder.

**Changes:**
1. In `registerVerificationKey()` (~line 220), add a revert for PLONK proof system:
   ```solidity
   require(_proofSystem != ProofSystem.PLONK, "PLONK verification not yet implemented");
   ```
2. In the internal `_verifyPlonk()` function (~line 520), add a leading revert as defense-in-depth:
   ```solidity
   revert("PLONK verification disabled — verifier is placeholder");
   ```
3. Add a NatSpec comment on PlonkVerifier.sol explaining it is a placeholder and must not be used until the 4 stub functions (`_computeLinearization`, `_computeBatchedCommitment`, `_computeBatchedEvaluation`, `_pairingCheck`) are completed with real PLONK math.

**Why not just delete PlonkVerifier.sol?** It's referenced by ZKVerifierAdapter and tests. Disabling at the adapter level is safer and preserves the code for future completion.

**Tests to add/update:**
- Test that `registerVerificationKey` reverts for PLONK proof system
- Test that any PLONK verification attempt reverts
- Existing Groth16 tests must still pass

---

### Step 1.2 — Disable direct oracle proof submission [C-2]

**File:** `contracts/TriggerMechanism.sol`
**What:** Make `submitOracleProof()` (line 532) permanently revert.

**Changes:**
1. Add `revert("Direct oracle mode disabled — use OracleRegistry or ZKVerifierAdapter")` as the first line of `submitOracleProof()`:
   ```solidity
   function submitOracleProof(address _creator, bytes memory _proof) external {
       revert("Direct oracle mode disabled — use OracleRegistry or ZKVerifierAdapter");
       // ... existing code preserved for reference but unreachable
   }
   ```
2. Update the NatSpec to mark as `@custom:deprecated`.

**Alternative (more aggressive):** Delete the function body entirely, leaving only the revert. This is cleaner but changes the ABI.

**Tests to add/update:**
- Test that `submitOracleProof` always reverts with the expected message
- Ensure `completeOracleVerification` (OracleRegistry path) still works
- Ensure `completeZKVerification` (ZKVerifierAdapter path) still works

---

### Step 1.3 — Add access control to `activateSunset()` [H-2]

**File:** `contracts/ExecutionAgent.sol`
**What:** Restrict `activateSunset()` (line 349) so only the SunsetProtocol contract can call it.

**Changes:**
1. Add a new role constant:
   ```solidity
   bytes32 public constant SUNSET_ROLE = keccak256("SUNSET_ROLE");
   ```
2. Add `onlyRole(SUNSET_ROLE)` modifier to `activateSunset()`:
   ```solidity
   function activateSunset(address _creator) external onlyRole(SUNSET_ROLE) {
   ```
3. In the deploy script (`scripts/deploy.js`), after deploying SunsetProtocol, grant `SUNSET_ROLE` to the SunsetProtocol address:
   ```javascript
   await executionAgent.grantRole(SUNSET_ROLE, sunsetProtocol.target);
   ```

**Tests to add/update:**
- Test that `activateSunset` reverts when called by non-SUNSET_ROLE address
- Test that SunsetProtocol (with SUNSET_ROLE) can call `activateSunset`
- Update integration tests that call `activateSunset` directly to use the SunsetProtocol path

---

### Step 1.4 — Make `allowPlaceholderVerification` immutable [H-1]

**File:** `contracts/oracles/ZKVerifierAdapter.sol`
**What:** Remove the ability to enable placeholder verification at runtime.

**Changes:**
1. Change `allowPlaceholderVerification` from a mutable state variable to an `immutable` constructor parameter:
   ```solidity
   bool public immutable allowPlaceholderVerification;

   constructor(bool _allowPlaceholder) Ownable(msg.sender) {
       allowPlaceholderVerification = _allowPlaceholder;
   }
   ```
2. Delete `setAllowPlaceholderVerification()` (lines 208-211) entirely.
3. Delete the `PlaceholderVerificationStatusChanged` event (no longer needed).
4. Update the deploy script to pass `false` for production and `true` only in test deployments.
5. Update the constructor call in deploy.js:
   ```javascript
   const ZKVerifierAdapter = await hre.ethers.getContractFactory("ZKVerifierAdapter");
   const zkAdapter = await ZKVerifierAdapter.deploy(false); // production: no placeholders
   ```

**Tests to add/update:**
- Test that `allowPlaceholderVerification` is `false` after production deployment
- Test that placeholder path reverts when `allowPlaceholderVerification` is `false`
- Test fixture for testing contexts can deploy with `true`

---

### Step 1.5 — Add staleness check to LexiconHolder resolutions [H-4]

**File:** `contracts/LexiconHolder.sol`
**What:** Prevent stale or replayed resolution results from gating execution. Add a staleness window so resolutions expire.

**Changes:**
1. Add a constant for maximum resolution age:
   ```solidity
   uint256 public constant MAX_RESOLUTION_AGE = 7 days;
   ```
2. In `resolveAmbiguity()` (~line 210), add a staleness check:
   ```solidity
   require(
       block.timestamp - result.resolvedAt <= MAX_RESOLUTION_AGE,
       "Resolution is stale — resubmit"
   );
   ```
3. In `submitResolution()` (line 145), add a nonce or version counter to prevent exact replay:
   ```solidity
   uint256 public resolutionNonce;

   // Inside submitResolution:
   resolutionCache[_creator][queryHash].nonce = ++resolutionNonce;
   ```

**Note on commit-reveal:** A full commit-reveal scheme adds significant complexity. For this phase, staleness + nonce is sufficient. Commit-reveal can be added in a future phase if multisig governance is adopted.

**Tests to add/update:**
- Test that `resolveAmbiguity` reverts for resolutions older than 7 days
- Test that fresh resolutions pass
- Test that nonce increments on each submission

---

### Step 1.6 — Improve deploy script role separation [C-3, H-3, I-11, I-13]

**File:** `scripts/deploy.js`
**What:** Add a post-deployment role transfer step and document multisig deployment.

**Changes:**
1. Add a new `transferRoles()` function at the end of the deploy script that:
   - Reads `MULTISIG_ADDRESS` from environment (already in `.env.example`)
   - Grants `DEFAULT_ADMIN_ROLE` to the multisig on all AccessControl contracts
   - Transfers `owner()` to the multisig on all Ownable contracts
   - Renounces `DEFAULT_ADMIN_ROLE` from the deployer
   - Renounces operational roles (`EXECUTOR_ROLE`, `INDEXER_ROLE`, `MINTER_ROLE`) from the deployer
2. Add a `--transfer-roles` CLI flag so this step is explicit and not automatic
3. Add network validation — require explicit `--network` flag and abort if targeting mainnet without `MULTISIG_ADDRESS`:
   ```javascript
   if (network === 'mainnet' && !process.env.MULTISIG_ADDRESS) {
       throw new Error("CRITICAL: MULTISIG_ADDRESS required for mainnet deployment");
   }
   ```
4. Add a deployment manifest output that records all contract addresses, roles, and transfer status

**Tests:** Manual verification on local Hardhat node. Add a deploy test script that verifies role assignments.

---

### Step 1.7 — Add STARK revert in ZKVerifierAdapter [H-1 supplement]

**File:** `contracts/oracles/ZKVerifierAdapter.sol`
**What:** The STARK path (lines 481-484) always falls through to placeholder. Make it revert explicitly.

**Changes:**
1. In the STARK branch of `verifyProof()`, replace the placeholder fallthrough with:
   ```solidity
   revert("STARK verification not implemented");
   ```
2. In `registerVerificationKey()`, block STARK key registration:
   ```solidity
   require(_proofSystem != ProofSystem.STARK, "STARK verification not yet implemented");
   ```

---

## Phase 2: Medium Contract Fixes (22 findings)

These fixes should be completed before mainnet but are not exploitable in isolation. Grouped by file to minimize context-switching.

### Step 2.1 — ExecutionAgent.sol fixes [M-13, M-16, L-1, L-13]

**File:** `contracts/ExecutionAgent.sol`

| Finding | Change |
|---------|--------|
| M-13 | Add `require(_recipient != address(0), "Zero address")` to `fundProject()` (before line 264) and `distributeRevenue()` (before line 320) |
| M-16 | Add `emit TreasuryDeposit(_creator, msg.value)` event to `depositToTreasury()` (line 303). Declare the event near line 110. |
| L-1 | Add `nonReentrant` modifier to `depositToTreasury()` (line 302) |
| L-13 | Add `require(msg.value > 0, "Zero deposit")` to `depositToTreasury()` |

**Tests:** Add tests for zero-address revert, zero-value deposit revert, event emission.

---

### Step 2.2 — IPToken.sol fixes [M-14, M-15, M-17, M-18, L-9, L-20]

**File:** `contracts/IPToken.sol`

| Finding | Change |
|---------|--------|
| M-14 | Add `require(_licensee != address(0), "Zero address")` to `grantLicense()` at line 142 |
| M-15 | Add `require(_recipient != address(0), "Zero address")` to `setRoyaltyInfo()` at line 233 |
| M-17 | Add `emit RoyaltyInfoUpdated(_tokenId, _recipient, _percentage)` event to `setRoyaltyInfo()`. Declare event. |
| M-18 | Override `_update()` to block transfers of public-domain tokens: `require(!ipAssets[tokenId].isPublicDomain, "Public domain tokens are non-transferable")` |
| L-9 | Add `MAX_TOKENS_PER_CREATOR` constant (e.g., 1000) and check in `mint()` |
| L-20 | Fix `revenueGenerated` to track proportionally per license instead of full amount |

**Tests:** Add tests for zero-address reverts, public-domain transfer block, token limit, proportional revenue.

---

### Step 2.3 — OracleRegistry.sol fixes [M-5, M-6, M-8, L-5, L-10]

**File:** `contracts/oracles/OracleRegistry.sol`

| Finding | Change |
|---------|--------|
| M-5 | Change `defaultConsensusThreshold` initial value from `1` to `2` at line 58 |
| M-8 | Wrap oracle call in try/catch in `requestAggregatedVerification()` at line 241: `try IOracle(oracleAddr).requestVerification(...) {} catch {}` |
| L-5 | Use rounding-up division for confidence averaging at line 278: `(a + b + 1) / 2` to avoid truncation |
| L-10 | Add a function to remove deactivated oracles from the list, or skip them in iteration |

M-6 (reputation gaming) is acknowledged as a design limitation — document in comments. Full fix requires redesigned reputation system.

**Tests:** Test consensus threshold enforcement, test that a reverting oracle doesn't DoS aggregation.

---

### Step 2.4 — Migrate 9 Ownable contracts to Ownable2Step [M-2]

**Files:** IntentCaptureModule.sol, TriggerMechanism.sol, ChainlinkAdapter.sol, OracleRegistry.sol, TrustedIssuerRegistry.sol, ZKVerifierAdapter.sol, UMAAdapter.sol, Groth16Verifier.sol, PlonkVerifier.sol

**Change for each:** Replace `import Ownable` with `import Ownable2Step` and change constructor from `Ownable(msg.sender)` to `Ownable2Step()` + `Ownable(msg.sender)`.

This is a mechanical change across 9 files. Test that `transferOwnership` requires `acceptOwnership` from the pending owner.

---

### Step 2.5 — Bound unbounded arrays [M-11, M-12, L-8]

| File | Array | Fix |
|------|-------|-----|
| ChainlinkAdapter.sol:187 | `creatorRequests` | Add `MAX_REQUESTS_PER_CREATOR` constant and check |
| ZKVerifierAdapter.sol:294 | `creatorRequests` | Same pattern |
| UMAAdapter.sol:238 | `creatorRequests` | Same pattern |
| Groth16Verifier.sol:147 | `keyIds` | Add `MAX_KEYS` constant and check |
| PlonkVerifier.sol:203 | `keyIds` | Same (academic since PLONK is disabled, but fix for consistency) |
| TrustedIssuerRegistry.sol:152 | `issuerList` / `issuersByJurisdiction` | Add `MAX_ISSUERS` constant |

---

### Step 2.6 — TriggerMechanism.sol fixes [M-9, M-10, L-2, L-4, L-7, L-12]

**File:** `contracts/TriggerMechanism.sol`

| Finding | Change |
|---------|--------|
| L-2 | Add `nonReentrant` to `executeDeadmanSwitch()` |
| L-12 | Add duplicate signer check in `configureQuorumTrigger()` — iterate to check for duplicates before adding |
| L-4 | Add configuration lock: `require(!config.isConfigured \|\| !configLocked[_creator], "Config locked")` with a `lockConfiguration()` function |
| L-7 | Restrict `completeOracleVerification`/`completeZKVerification` to the OracleRegistry/ZKVerifierAdapter addresses |

M-9 and M-10 (front-running) are acknowledged — commit-reveal for trigger submission is out of scope for this phase. Document the risk in NatSpec.

---

### Step 2.7 — PoliticalFilter hardening [M-19, M-20, M-21]

**File:** `contracts/libraries/PoliticalFilter.sol`

| Finding | Change |
|---------|--------|
| M-19 | Add leet-speak normalization: map `0→o, 1→i/l, 3→e, 4→a, 5→s, 7→t, @→a, $→s` before keyword matching |
| M-20 | Expand misspelling dictionary from 31 to ~60 entries covering transpositions (e.g., "campagn" → "campaign") and phonetic variants |
| M-21 | Move `republican`, `democrat`, `conservative`, `liberal` from secondary to primary keywords so they are blocked rather than advisory |

**Tests:** Update PoliticalFilter test corpus. Add leet-speak test cases ("v0t3", "el3cti0n"). Verify party terms now block.

---

### Step 2.8 — Remove dead code [M-22, L-21, L-22]

| Finding | Change |
|---------|--------|
| M-22 | Remove `ErrorHandler.sol` entirely if no contract uses it. Update imports in any file that references it. |
| L-21 | Remove `assetTransitioned` mapping from SunsetProtocol.sol:77 |
| L-22 | Remove `tx.origin` usage from ErrorHandler.sol (moot if ErrorHandler is removed) |

---

### Step 2.9 — Add missing events [M-16, M-17, L-17, L-18, L-19]

| Finding | File | Event to Add |
|---------|------|-------------|
| M-16 | ExecutionAgent.sol | `TreasuryDeposit(address creator, uint256 amount)` in `depositToTreasury` |
| M-17 | IPToken.sol | `RoyaltyInfoUpdated(uint256 tokenId, address recipient, uint256 percentage)` in `setRoyaltyInfo` |
| L-17 | IntentCaptureModule.sol | `VersionSigned(address creator, address signer, bytes32 versionHash)` in `signVersion` |
| L-18 | SunsetProtocol.sol | Add `isComplete` flag to `SunsetCompleted` event or add separate `SunsetFinalized` event |
| L-19 | ChainlinkAdapter.sol | Add distinct `RequestExpired` event instead of reusing fulfillment event |

---

### Step 2.10 — ChainlinkAdapter / UMAAdapter fixes [M-3, L-3, L-6, L-14]

| Finding | File | Change |
|---------|------|--------|
| M-3 | ChainlinkAdapter.sol:92 | Remove auto-authorization of owner as fulfillment operator. Require explicit registration. |
| L-3 | ChainlinkAdapter.sol:313 | Restrict `disputeVerification` to request creator or oracle role |
| L-6 | UMAAdapter.sol:317,395 | Reset approval to 0 before setting new value: `token.approve(spender, 0); token.approve(spender, amount);` Or use `safeIncreaseAllowance` |
| L-14 | UMAAdapter.sol:132 | Add `require(_finder != address(0) && _currency != address(0))` in constructor |

---

## Phase 3: Infrastructure & Frontend Fixes (19 findings)

### Step 3.1 — CI pipeline hardening [I-4, I-16, I-18, I-19]

**File:** `.github/workflows/ci.yml`

Add new jobs:

```yaml
  security:
    name: Security Checks
    runs-on: ubuntu-latest
    needs: compile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - name: npm audit
        run: npm audit --audit-level=high
      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified
      - name: Install Slither
        run: pip3 install slither-analyzer
      - name: Run Slither
        run: slither . --filter-paths "node_modules" --sarif output.sarif
        continue-on-error: true
      - name: Upload Slither results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: output.sarif
```

Update `foundry-test` job to be a required check (not just informational).

---

### Step 3.2 — Add Dependabot [I-17]

**File (new):** `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

---

### Step 3.3 — Frontend security [I-5, I-6, I-7, I-8, I-9, I-10]

| Finding | File | Change |
|---------|------|--------|
| I-5 | `frontend/index.html` | Add CSP meta tag: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https://*.alchemy.com https://*.infura.io;">` |
| I-6 | `frontend/src/context/Web3Context.jsx` | Read RPC URLs from `VITE_RPC_URL` env variable only; remove hardcoded fallbacks |
| I-7 | `frontend/src/pages/IntentCapture.jsx` | Add input length validation and character sanitization before contract submission |
| I-8 | `frontend/src/pages/*.jsx` | Wrap contract call errors in generic user-facing messages; log full errors to console only |
| I-9 | `frontend/src/context/Web3Context.jsx` | Add simple debounce/throttle on RPC calls (e.g., 1 call per 500ms per method) |
| I-10 | `frontend/package.json` | Move dev-only deps (eslint, vite plugins) to `devDependencies` if not already |

---

### Step 3.4 — Deployment script improvements [I-11, I-12, I-14, I-15]

**File:** `scripts/deploy.js`

| Finding | Change |
|---------|--------|
| I-12 | Already has verification logic (lines 59+). Ensure it runs by default on verifiable networks instead of requiring `VERIFY_CONTRACTS=true` |
| I-14 | Already saves deployment manifest. Ensure it includes role assignments and transfer status |
| I-15 | Add explicit network check: `if (!CONFIG.CONFIRMATIONS[network]) throw new Error("Unknown network")` |

I-11 (single key) is addressed by Step 1.6.

---

### Step 3.5 — Environment and secrets [I-1, I-2, I-3]

| Finding | Change |
|---------|--------|
| I-1 | Change `.env.example` `PRIVATE_KEY` line to `PRIVATE_KEY=` (empty, no placeholder pattern) with a comment: `# NEVER commit a real private key. Use hardware wallet for production.` |
| I-2 | Add a CI step that verifies `.env` is in `.gitignore` and no `.env` file exists in the repo |
| I-3 | Add validation in `hardhat.config.js` `getPrivateKey()` that rejects known test/example key patterns |

---

## Phase 4: Remaining Low Findings (addressed inline above)

All LOW findings are covered in Phases 2-3 as they share files with MEDIUM fixes. Specifically:

| Low Finding | Addressed In |
|-------------|-------------|
| L-1, L-13 | Step 2.1 |
| L-2, L-4, L-7, L-12 | Step 2.6 |
| L-3, L-6, L-14 | Step 2.10 |
| L-5, L-10 | Step 2.3 |
| L-8 | Step 2.5 |
| L-9, L-20 | Step 2.2 |
| L-11 | Acknowledged — `block.timestamp` nondeterminism is inherent; document in NatSpec |
| L-15 | Add `require(!intents[msg.sender].isConfigured, "Intent already captured")` in IntentCaptureModule.sol:80 |
| L-16 | Add duplicate check in SunsetProtocol `archiveAssets()` using a mapping |
| L-17, L-18, L-19 | Step 2.9 |
| L-21, L-22 | Step 2.8 |
| L-23 | Acknowledged — ASCII-only is intentional security/internationalization tradeoff. Document. |
| L-24 | Acknowledged — gas cost is bounded by `MAX_FILTER_STRING_LENGTH=1000`. No change needed. |

---

## Execution Order & Dependencies

```
Phase 1 (Critical/High — sequential, each builds on prior)
  1.1 Disable PLONK path          → no deps
  1.2 Disable direct oracle        → no deps
  1.3 Access control activateSunset → no deps
  1.4 Immutable placeholder flag    → depends on 1.1 (same file)
  1.5 Resolution staleness          → no deps
  1.6 Deploy script role separation → depends on 1.3 (SUNSET_ROLE)
  1.7 STARK revert                  → depends on 1.1 (same file)

Phase 2 (Medium — can be parallelized by file)
  2.1 ExecutionAgent fixes     ─┐
  2.2 IPToken fixes            │
  2.3 OracleRegistry fixes     │  All independent,
  2.4 Ownable2Step migration   │  can be done in
  2.5 Bound arrays             │  parallel by file
  2.6 TriggerMechanism fixes   │
  2.7 PoliticalFilter          │
  2.8 Remove dead code         │
  2.9 Add events               │
  2.10 Adapter fixes           ─┘

Phase 3 (Infrastructure — independent of contract changes)
  3.1 CI pipeline              ─┐
  3.2 Dependabot               │  All independent
  3.3 Frontend security        │
  3.4 Deploy script            │
  3.5 Environment/secrets      ─┘
```

---

## Files Changed Summary

| File | Phases | Changes |
|------|--------|---------|
| `contracts/ExecutionAgent.sol` | 1, 2 | SUNSET_ROLE, zero-address checks, deposit event, nonReentrant |
| `contracts/TriggerMechanism.sol` | 1, 2 | Disable submitOracleProof, nonReentrant, duplicate signer check, config lock |
| `contracts/oracles/ZKVerifierAdapter.sol` | 1 | Immutable placeholder flag, disable PLONK/STARK |
| `contracts/LexiconHolder.sol` | 1, 2 | Staleness check, nonce |
| `contracts/IPToken.sol` | 2 | Zero-address checks, transfer restriction, events, token limit |
| `contracts/oracles/OracleRegistry.sol` | 2 | Consensus threshold, try/catch, rounding |
| `contracts/libraries/PoliticalFilter.sol` | 2 | Leet-speak normalization, expanded misspellings, party terms |
| `contracts/libraries/ErrorHandler.sol` | 2 | Remove entirely |
| `contracts/SunsetProtocol.sol` | 2 | Remove unused mapping, completion event |
| `contracts/IntentCaptureModule.sol` | 2 | Overwrite prevention, signVersion event |
| 9 Ownable contracts | 2 | Ownable → Ownable2Step migration |
| 5 oracle/verifier contracts | 2 | Array bounds |
| `contracts/oracles/ChainlinkAdapter.sol` | 2 | Remove auto-auth, restrict dispute, distinct expire event |
| `contracts/oracles/UMAAdapter.sol` | 2 | Approve reset, zero-address constructor check |
| `scripts/deploy.js` | 1, 3 | Role transfer, SUNSET_ROLE grant, network validation |
| `.github/workflows/ci.yml` | 3 | npm audit, Slither, trufflehog, Foundry as required |
| `.github/dependabot.yml` | 3 | New file |
| `frontend/index.html` | 3 | CSP header |
| `frontend/src/context/Web3Context.jsx` | 3 | Remove hardcoded RPCs, add throttle |
| `frontend/src/pages/IntentCapture.jsx` | 3 | Input validation |
| `frontend/src/pages/*.jsx` | 3 | Error message sanitization |
| `.env.example` | 3 | Clear placeholder key |
| `hardhat.config.js` | 3 | Key validation |
| `SECURITY.md` | All | Update status and changelog after each phase |

**Total files modified:** ~30
**New files:** 1 (`.github/dependabot.yml`)
**Deleted files:** 1 (`contracts/libraries/ErrorHandler.sol`)

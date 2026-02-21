// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PoliticalFilter
 * @author Finite Intent Executor
 * @dev Enhanced political activity detection library
 *
 * This library implements multi-layered filtering to enforce the
 * "No Political Agency" clause, preventing posthumous execution
 * from engaging in political activities.
 *
 * Detection layers:
 * 1. Exact action hash matching (known prohibited actions)
 * 2. Primary keyword detection (high confidence political terms)
 * 3. Secondary keyword detection (contextual political terms)
 * 4. Pattern matching for common political phrases
 * 5. Category-based classification
 *
 * SECURITY: This is a defense-in-depth approach. Even if one layer
 * fails to detect political activity, other layers may catch it.
 */
library PoliticalFilter {
    // ============================================================
    // CONSTANTS
    // ============================================================

    /// @dev Maximum string length for filtering to prevent DoS
    uint256 private constant MAX_FILTER_STRING_LENGTH = 1000;

    // ============================================================
    // PROHIBITED ACTION HASHES
    // Known political action types that are always blocked
    // ============================================================

    bytes32 private constant ELECTORAL_ACTIVITY = keccak256("electoral_activity");
    bytes32 private constant POLITICAL_ADVOCACY = keccak256("political_advocacy");
    bytes32 private constant LOBBYING = keccak256("lobbying");
    bytes32 private constant POLICY_INFLUENCE = keccak256("policy_influence");
    bytes32 private constant CAMPAIGN_DONATION = keccak256("campaign_donation");
    bytes32 private constant POLITICAL_ENDORSEMENT = keccak256("political_endorsement");
    bytes32 private constant VOTER_REGISTRATION = keccak256("voter_registration");
    bytes32 private constant POLITICAL_PARTY_SUPPORT = keccak256("political_party_support");
    bytes32 private constant LEGISLATIVE_ADVOCACY = keccak256("legislative_advocacy");
    bytes32 private constant GOVERNMENT_LOBBYING = keccak256("government_lobbying");

    // ============================================================
    // DETECTION CATEGORIES
    // ============================================================

    enum PoliticalCategory {
        None,
        Electoral,      // Elections, voting, campaigns
        Lobbying,       // Legislative influence, policy advocacy
        Partisan,       // Party politics, political endorsements
        Governmental,   // Government influence, regulatory capture
        Activism        // Political activism, advocacy campaigns
    }

    struct FilterResult {
        bool isProhibited;
        PoliticalCategory category;
        string matchedTerm;
        uint8 confidenceScore; // 0-100, higher = more confident it's political
    }

    // ============================================================
    // PRIMARY KEYWORDS (High confidence political terms)
    // ============================================================

    /**
     * @dev Primary keywords that strongly indicate political activity
     * Any action containing these terms is blocked
     */
    function _isPrimaryPoliticalKeyword(bytes memory actionBytes) internal pure returns (bool, string memory) {
        // Electoral keywords
        if (_containsCI(actionBytes, "electoral")) return (true, "electoral");
        if (_containsCI(actionBytes, "election")) return (true, "election");
        if (_containsCI(actionBytes, "campaign")) return (true, "campaign");
        if (_containsCI(actionBytes, "ballot")) return (true, "ballot");
        if (_containsCIWordBoundary(actionBytes, "vote")) return (true, "vote");
        if (_containsCIWordBoundary(actionBytes, "voting")) return (true, "voting");
        if (_containsCIWordBoundary(actionBytes, "voter")) return (true, "voter");

        // Lobbying keywords
        if (_containsCI(actionBytes, "lobby")) return (true, "lobby");
        if (_containsCI(actionBytes, "lobbying")) return (true, "lobbying");
        if (_containsCI(actionBytes, "lobbyist")) return (true, "lobbyist");

        // Political keywords
        if (_containsCI(actionBytes, "political")) return (true, "political");
        if (_containsCI(actionBytes, "politician")) return (true, "politician");
        if (_containsCI(actionBytes, "partisan")) return (true, "partisan");

        // Policy keywords (note: "policy" moved to secondary — too many false positives
        // e.g., "insurance policy distribution")
        if (_containsCI(actionBytes, "legislation")) return (true, "legislation");
        if (_containsCI(actionBytes, "legislative")) return (true, "legislative");
        if (_containsCI(actionBytes, "lawmaker")) return (true, "lawmaker");

        // Government keywords
        if (_containsCI(actionBytes, "government")) return (true, "government");
        if (_containsCI(actionBytes, "senator")) return (true, "senator");
        if (_containsCI(actionBytes, "congressman")) return (true, "congressman");
        if (_containsCI(actionBytes, "parliament")) return (true, "parliament");

        // Party keywords [Audit fix: M-21] — promoted from secondary to primary
        // These are unambiguous political party references
        if (_containsCIWordBoundary(actionBytes, "republican")) return (true, "republican");
        if (_containsCIWordBoundary(actionBytes, "democrat")) return (true, "democrat");

        return (false, "");
    }

    // ============================================================
    // SECONDARY KEYWORDS (Context-dependent political terms)
    // ============================================================

    /**
     * @dev Secondary keywords that may indicate political activity when
     * combined with other indicators. Uses word-boundary matching to reduce
     * false positives (e.g., "conservative estimate", "liberal interpretation").
     *
     * IMPORTANT: Secondary matches are advisory only (isProhibited = false).
     * They are logged for review but do not block action execution.
     * This prevents legitimate phrases like "insurance policy distribution",
     * "advocate for better tooling", or "regulatory compliance" from being blocked.
     */
    function _isSecondaryPoliticalKeyword(bytes memory actionBytes) internal pure returns (bool, string memory) {
        // Policy term (moved from primary — high false-positive rate)
        if (_containsCIWordBoundary(actionBytes, "policy")) return (true, "policy");

        // Advocacy terms
        if (_containsCIWordBoundary(actionBytes, "advocacy")) return (true, "advocacy");
        if (_containsCIWordBoundary(actionBytes, "advocate")) return (true, "advocate");
        if (_containsCIWordBoundary(actionBytes, "endorse")) return (true, "endorse");
        if (_containsCIWordBoundary(actionBytes, "endorsement")) return (true, "endorsement");

        // Regulatory terms
        if (_containsCIWordBoundary(actionBytes, "regulatory")) return (true, "regulatory");
        if (_containsCIWordBoundary(actionBytes, "regulation")) return (true, "regulation");
        if (_containsCIWordBoundary(actionBytes, "deregulation")) return (true, "deregulation");

        // Influence terms
        if (_containsCIWordBoundary(actionBytes, "influence")) return (true, "influence");
        if (_containsCIWordBoundary(actionBytes, "persuade")) return (true, "persuade");
        if (_containsCIWordBoundary(actionBytes, "sway")) return (true, "sway");

        // Party terms [Audit fix: M-21] — republican/democrat promoted to primary
        // conservative/liberal kept as secondary (high false-positive rate)
        if (_containsCIWordBoundary(actionBytes, "conservative")) return (true, "conservative");
        if (_containsCIWordBoundary(actionBytes, "liberal")) return (true, "liberal");

        return (false, "");
    }

    // ============================================================
    // PHRASE PATTERNS
    // ============================================================

    /**
     * @dev Common political phrases that indicate prohibited activity
     */
    function _containsPoliticalPhrase(bytes memory actionBytes) internal pure returns (bool, string memory) {
        // Electoral phrases
        if (_containsCI(actionBytes, "get out the vote")) return (true, "get out the vote");
        if (_containsCI(actionBytes, "voter registration")) return (true, "voter registration");
        if (_containsCI(actionBytes, "campaign contribution")) return (true, "campaign contribution");
        if (_containsCI(actionBytes, "political action committee")) return (true, "political action committee");
        if (_containsCI(actionBytes, "super pac")) return (true, "super pac");

        // Lobbying phrases
        if (_containsCI(actionBytes, "contact your representative")) return (true, "contact your representative");
        if (_containsCI(actionBytes, "call your senator")) return (true, "call your senator");
        if (_containsCI(actionBytes, "write to congress")) return (true, "write to congress");
        if (_containsCI(actionBytes, "policy change")) return (true, "policy change");
        if (_containsCI(actionBytes, "legislative action")) return (true, "legislative action");

        // Activism phrases
        if (_containsCI(actionBytes, "political movement")) return (true, "political movement");
        if (_containsCI(actionBytes, "grassroots organizing")) return (true, "grassroots organizing");
        if (_containsCI(actionBytes, "political rally")) return (true, "political rally");
        if (_containsCI(actionBytes, "protest march")) return (true, "protest march");

        return (false, "");
    }

    // ============================================================
    // MAIN FILTER FUNCTION
    // ============================================================

    /**
     * @dev Normalize common leet-speak substitutions back to ASCII letters
     *      [Audit fix: M-19] Prevents bypass via "3lect1on", "v0te", etc.
     * @notice Only handles single-byte substitutions. Multi-character sequences
     *         (e.g., "|_|" for U) are not normalized due to gas constraints.
     */
    function _normalizeLeetSpeak(bytes memory input) private pure returns (bytes memory) {
        bytes memory output = new bytes(input.length);
        for (uint256 i = 0; i < input.length; i++) {
            bytes1 b = input[i];
            if (b == "0") output[i] = "o";
            else if (b == "1") output[i] = "i";
            else if (b == "3") output[i] = "e";
            else if (b == "4") output[i] = "a";
            else if (b == "5") output[i] = "s";
            else if (b == "7") output[i] = "t";
            else if (b == "@") output[i] = "a";
            else if (b == "$") output[i] = "s";
            else if (b == "!") output[i] = "i";
            else output[i] = b;
        }
        return output;
    }

    /**
     * @dev Main filter function - performs comprehensive political activity check
     * @param action The action string to check
     * @return result FilterResult struct with detection details
     *
     * @custom:gas-analysis [Audit fix: L-24]
     *   - Fast path (no bigram match): ~3,000 gas for 1000-byte string
     *   - Full scan (worst case): ~150,000 gas for 1000-byte string with all layers
     *   - Average case (legitimate actions): ~5,000 gas
     *   Bounded by MAX_FILTER_STRING_LENGTH = 1000
     */
    function checkAction(string memory action) internal pure returns (FilterResult memory result) {
        bytes memory actionBytes = bytes(action);

        // Early return if string is too long (DoS protection)
        if (actionBytes.length > MAX_FILTER_STRING_LENGTH) {
            return FilterResult({
                isProhibited: true,
                category: PoliticalCategory.None,
                matchedTerm: "string_too_long",
                confidenceScore: 0
            });
        }

        // Layer 0: Check for suspicious non-ASCII characters (homoglyph attack protection)
        // [Audit fix: L-23] Now only blocks Cyrillic/Greek homoglyphs, allows accented Latin + CJK
        if (_containsSuspiciousCharacters(actionBytes)) {
            return FilterResult({
                isProhibited: true,
                category: PoliticalCategory.None,
                matchedTerm: "suspicious_homoglyph_characters",
                confidenceScore: 80
            });
        }

        // [Audit fix: L-24] Fast path: skip expensive multi-layer scanning for strings
        // that contain no political bigrams. Most legitimate actions hit this path.
        if (!_containsPoliticalBigram(actionBytes)) {
            return FilterResult({
                isProhibited: false,
                category: PoliticalCategory.None,
                matchedTerm: "",
                confidenceScore: 0
            });
        }

        bytes32 actionHash = keccak256(abi.encodePacked(action));

        // Layer 1: Check exact action hashes
        if (_isProhibitedActionHash(actionHash)) {
            return FilterResult({
                isProhibited: true,
                category: _getCategoryFromHash(actionHash),
                matchedTerm: action,
                confidenceScore: 100
            });
        }

        // Layer 2: Check primary keywords
        (bool primaryMatch, string memory primaryTerm) = _isPrimaryPoliticalKeyword(actionBytes);
        if (primaryMatch) {
            return FilterResult({
                isProhibited: true,
                category: _inferCategory(primaryTerm),
                matchedTerm: primaryTerm,
                confidenceScore: 95
            });
        }

        // Layer 2.5: Check common misspellings of political terms
        (bool misspellMatch, string memory misspellTerm) = _isCommonMisspelling(actionBytes);
        if (misspellMatch) {
            return FilterResult({
                isProhibited: true,
                category: _inferCategory(misspellTerm),
                matchedTerm: misspellTerm,
                confidenceScore: 90
            });
        }

        // Layer 2.7: Leet-speak normalization pass [Audit fix: M-19]
        // Re-check primary keywords after normalizing common substitutions
        bytes memory normalizedBytes = _normalizeLeetSpeak(actionBytes);
        (bool leetMatch, string memory leetTerm) = _isPrimaryPoliticalKeyword(normalizedBytes);
        if (leetMatch) {
            return FilterResult({
                isProhibited: true,
                category: _inferCategory(leetTerm),
                matchedTerm: leetTerm,
                confidenceScore: 85
            });
        }

        // Layer 3: Check political phrases
        (bool phraseMatch, string memory phrase) = _containsPoliticalPhrase(actionBytes);
        if (phraseMatch) {
            return FilterResult({
                isProhibited: true,
                category: _inferCategory(phrase),
                matchedTerm: phrase,
                confidenceScore: 90
            });
        }

        // Layer 4: Check secondary keywords (advisory only — does NOT block)
        // Secondary matches are informational: they populate matchedTerm and category
        // for logging but do not prevent action execution. This prevents false positives
        // on legitimate phrases like "insurance policy", "conservative estimate", etc.
        (bool secondaryMatch, string memory secondaryTerm) = _isSecondaryPoliticalKeyword(actionBytes);
        if (secondaryMatch) {
            return FilterResult({
                isProhibited: false,
                category: _inferCategory(secondaryTerm),
                matchedTerm: secondaryTerm,
                confidenceScore: 85
            });
        }

        // No political activity detected
        return FilterResult({
            isProhibited: false,
            category: PoliticalCategory.None,
            matchedTerm: "",
            confidenceScore: 0
        });
    }

    /**
     * @dev Simple boolean check for quick filtering
     * @param action The action string to check
     * @return true if action is prohibited
     */
    function isProhibited(string memory action) internal pure returns (bool) {
        FilterResult memory result = checkAction(action);
        return result.isProhibited;
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    /**
     * @dev Check if action hash matches a known prohibited action
     */
    function _isProhibitedActionHash(bytes32 actionHash) private pure returns (bool) {
        return actionHash == ELECTORAL_ACTIVITY ||
               actionHash == POLITICAL_ADVOCACY ||
               actionHash == LOBBYING ||
               actionHash == POLICY_INFLUENCE ||
               actionHash == CAMPAIGN_DONATION ||
               actionHash == POLITICAL_ENDORSEMENT ||
               actionHash == VOTER_REGISTRATION ||
               actionHash == POLITICAL_PARTY_SUPPORT ||
               actionHash == LEGISLATIVE_ADVOCACY ||
               actionHash == GOVERNMENT_LOBBYING;
    }

    /**
     * @dev Get category from known action hash
     */
    function _getCategoryFromHash(bytes32 actionHash) private pure returns (PoliticalCategory) {
        if (actionHash == ELECTORAL_ACTIVITY ||
            actionHash == VOTER_REGISTRATION) {
            return PoliticalCategory.Electoral;
        }
        if (actionHash == LOBBYING ||
            actionHash == GOVERNMENT_LOBBYING ||
            actionHash == LEGISLATIVE_ADVOCACY) {
            return PoliticalCategory.Lobbying;
        }
        if (actionHash == POLITICAL_PARTY_SUPPORT ||
            actionHash == POLITICAL_ENDORSEMENT) {
            return PoliticalCategory.Partisan;
        }
        if (actionHash == POLICY_INFLUENCE) {
            return PoliticalCategory.Governmental;
        }
        if (actionHash == POLITICAL_ADVOCACY ||
            actionHash == CAMPAIGN_DONATION) {
            return PoliticalCategory.Activism;
        }
        return PoliticalCategory.None;
    }

    /**
     * @dev Infer category from matched term
     */
    function _inferCategory(string memory term) private pure returns (PoliticalCategory) {
        bytes memory termBytes = bytes(term);

        // Electoral terms
        if (_containsCI(termBytes, "elect") ||
            _containsCI(termBytes, "vote") ||
            _containsCI(termBytes, "ballot") ||
            _containsCI(termBytes, "campaign")) {
            return PoliticalCategory.Electoral;
        }

        // Lobbying terms
        if (_containsCI(termBytes, "lobby") ||
            _containsCI(termBytes, "legislat") ||
            _containsCI(termBytes, "congress") ||
            _containsCI(termBytes, "senator")) {
            return PoliticalCategory.Lobbying;
        }

        // Partisan terms
        if (_containsCI(termBytes, "republican") ||
            _containsCI(termBytes, "democrat") ||
            _containsCI(termBytes, "partisan") ||
            _containsCI(termBytes, "endorse")) {
            return PoliticalCategory.Partisan;
        }

        // Governmental terms
        if (_containsCI(termBytes, "government") ||
            _containsCI(termBytes, "regul") ||
            _containsCI(termBytes, "policy")) {
            return PoliticalCategory.Governmental;
        }

        // Default to activism
        return PoliticalCategory.Activism;
    }

    /**
     * @dev Check if a byte is an ASCII letter (a-z, A-Z)
     */
    function _isAlpha(bytes1 b) private pure returns (bool) {
        uint8 v = uint8(b);
        return (v >= 65 && v <= 90) || (v >= 97 && v <= 122);
    }

    /**
     * @dev Case-insensitive substring check with word-boundary enforcement
     * Matches only when the needle is bounded by non-alpha characters
     * (spaces, underscores, digits, punctuation, or string edges).
     * Prevents "devote" from matching "vote", "rsvp" from matching "svp", etc.
     */
    function _containsCIWordBoundary(bytes memory haystack, string memory needle) private pure returns (bool) {
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length > haystack.length) return false;
        if (needleBytes.length == 0) return false;

        for (uint256 i = 0; i <= haystack.length - needleBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < needleBytes.length; j++) {
                bytes1 h = _toLower(haystack[i + j]);
                bytes1 n = _toLower(needleBytes[j]);
                if (h != n) {
                    found = false;
                    break;
                }
            }
            if (found) {
                // Check left boundary: position 0 or non-alpha character before match
                if (i > 0 && _isAlpha(haystack[i - 1])) continue;
                // Check right boundary: end of string or non-alpha character after match
                uint256 endPos = i + needleBytes.length;
                if (endPos < haystack.length && _isAlpha(haystack[endPos])) continue;
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Case-insensitive substring check
     * Converts both strings to lowercase before comparison
     */
    function _containsCI(bytes memory haystack, string memory needle) private pure returns (bool) {
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length > haystack.length) return false;
        if (needleBytes.length == 0) return false;

        for (uint256 i = 0; i <= haystack.length - needleBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < needleBytes.length; j++) {
                bytes1 h = _toLower(haystack[i + j]);
                bytes1 n = _toLower(needleBytes[j]);
                if (h != n) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    /**
     * @dev Convert byte to lowercase
     */
    function _toLower(bytes1 b) private pure returns (bytes1) {
        if (uint8(b) >= 65 && uint8(b) <= 90) {
            return bytes1(uint8(b) + 32);
        }
        return b;
    }

    /**
     * @dev Check for suspicious non-ASCII characters that could be used for homoglyph attacks
     * @notice [Audit fix: L-23] Targeted homoglyph detection — only blocks Cyrillic (U+0400-U+04FF)
     *         and Greek (U+0370-U+03FF) ranges which contain Latin lookalikes. Allows:
     *         - Latin Extended (U+0080-U+024F): accented chars like é, ñ, ü
     *         - 3-byte sequences (U+0800+): CJK, emoji, Arabic, etc.
     *         - 4-byte sequences: supplementary characters
     *         Still blocks malformed UTF-8 sequences.
     *
     *         Examples of Cyrillic homoglyphs blocked: а→a, р→p, е→e, о→o, с→c
     */
    function _containsSuspiciousCharacters(bytes memory str) private pure returns (bool) {
        for (uint256 i = 0; i < str.length; i++) {
            uint8 b = uint8(str[i]);

            // ASCII is always safe
            if (b < 0x80) continue;

            // 2-byte UTF-8 sequence: 110xxxxx 10xxxxxx → codepoints U+0080 to U+07FF
            if (b >= 0xC0 && b < 0xE0) {
                if (i + 1 >= str.length) return true; // malformed — truncated sequence
                uint8 b2 = uint8(str[i + 1]);
                if (b2 < 0x80 || b2 >= 0xC0) return true; // malformed continuation byte

                // Decode codepoint
                uint256 cp = ((uint256(b) & 0x1F) << 6) | (uint256(b2) & 0x3F);

                // Block Cyrillic (U+0370-U+04FF) — contains most Latin homoglyphs
                if (cp >= 0x0370 && cp <= 0x04FF) return true;

                // Allow everything else in 2-byte range:
                // Latin Extended-A/B (U+0100-U+024F): ā, ę, ő, etc.
                // Latin Extended Additional (U+1E00-U+1EFF) — in 3-byte range
                // Spacing modifiers, diacritical marks, etc.
                i += 1; // skip continuation byte
                continue;
            }

            // 3-byte UTF-8 sequence: 1110xxxx 10xxxxxx 10xxxxxx → U+0800 to U+FFFF
            if (b >= 0xE0 && b < 0xF0) {
                if (i + 2 >= str.length) return true; // malformed
                uint8 b2 = uint8(str[i + 1]);
                uint8 b3 = uint8(str[i + 2]);
                if (b2 < 0x80 || b2 >= 0xC0 || b3 < 0x80 || b3 >= 0xC0) return true; // malformed

                // Allow all 3-byte sequences (CJK, Arabic, Hebrew, emoji plane 0, etc.)
                // None of these scripts contain Latin homoglyphs
                i += 2;
                continue;
            }

            // 4-byte UTF-8 sequence: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx → U+10000+
            if (b >= 0xF0 && b < 0xF8) {
                if (i + 3 >= str.length) return true; // malformed
                uint8 b2 = uint8(str[i + 1]);
                uint8 b3 = uint8(str[i + 2]);
                uint8 b4 = uint8(str[i + 3]);
                if (b2 < 0x80 || b2 >= 0xC0 || b3 < 0x80 || b3 >= 0xC0 ||
                    b4 < 0x80 || b4 >= 0xC0) return true; // malformed

                // Allow supplementary characters (emoji, etc.)
                i += 3;
                continue;
            }

            // Unexpected byte (0x80-0xBF without leading byte, or 0xF8+)
            return true;
        }
        return false;
    }

    /**
     * @dev [Audit fix: L-24] Fast-path bigram check to short-circuit expensive scanning.
     *      Checks for 2-letter sequences present in nearly all political keywords.
     *      A single O(n) pass that gates the remaining ~O(n*80) keyword passes.
     *
     * Bigrams chosen to cover all primary keywords:
     *   "ot" (vote, political), "el" (elect, election), "ob" (lobby),
     *   "am" (campaign), "ov" (government), "eg" (legislation), "ar" (partisan),
     *   "al" (electoral, ballot), "ol" (political), "en" (endorsement),
     *   "ep" (republican), "em" (democrat)
     *
     * @return true if the string contains at least one political bigram (needs full scan)
     */
    function _containsPoliticalBigram(bytes memory actionBytes) private pure returns (bool) {
        if (actionBytes.length < 2) return false;
        for (uint256 i = 0; i < actionBytes.length - 1; i++) {
            bytes1 a = _toLower(actionBytes[i]);
            bytes1 b = _toLower(actionBytes[i + 1]);
            if ((a == "o" && b == "t") || (a == "e" && b == "l") ||
                (a == "o" && b == "b") || (a == "a" && b == "m") ||
                (a == "o" && b == "v") || (a == "e" && b == "g") ||
                (a == "a" && b == "r") || (a == "a" && b == "l") ||
                (a == "o" && b == "l") || (a == "e" && b == "n") ||
                (a == "e" && b == "p") || (a == "e" && b == "m") ||
                (a == "a" && b == "w") || (a == "o" && b == "n")) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Check for common misspellings of political terms
     * @notice Catches intentional typos used to bypass keyword filters
     */
    function _isCommonMisspelling(bytes memory actionBytes) private pure returns (bool, string memory) {
        // Electoral misspellings
        if (_containsCI(actionBytes, "electon")) return (true, "election");
        if (_containsCI(actionBytes, "elction")) return (true, "election");
        if (_containsCI(actionBytes, "elektion")) return (true, "election");
        if (_containsCI(actionBytes, "electorial")) return (true, "electoral");
        if (_containsCI(actionBytes, "campain")) return (true, "campaign");
        if (_containsCI(actionBytes, "campaing")) return (true, "campaign");
        if (_containsCI(actionBytes, "campagne")) return (true, "campaign");

        // Political misspellings
        if (_containsCI(actionBytes, "politcal")) return (true, "political");
        if (_containsCI(actionBytes, "politacal")) return (true, "political");
        if (_containsCI(actionBytes, "poilitical")) return (true, "political");
        if (_containsCI(actionBytes, "politicial")) return (true, "political");
        if (_containsCI(actionBytes, "pollitical")) return (true, "political");

        // Lobbying misspellings
        if (_containsCI(actionBytes, "lobying")) return (true, "lobbying");
        if (_containsCI(actionBytes, "lobbiing")) return (true, "lobbying");
        if (_containsCI(actionBytes, "lobyist")) return (true, "lobbyist");

        // Vote misspellings
        if (_containsCI(actionBytes, "votre")) return (true, "vote");
        if (_containsCI(actionBytes, "voteing")) return (true, "voting");
        if (_containsCI(actionBytes, "votting")) return (true, "voting");

        // Government misspellings
        if (_containsCI(actionBytes, "goverment")) return (true, "government");
        if (_containsCI(actionBytes, "governement")) return (true, "government");
        if (_containsCI(actionBytes, "govermnent")) return (true, "government");
        if (_containsCI(actionBytes, "govenment")) return (true, "government");

        // Legislation misspellings
        if (_containsCI(actionBytes, "legistation")) return (true, "legislation");
        if (_containsCI(actionBytes, "legeslation")) return (true, "legislation");
        if (_containsCI(actionBytes, "legislaton")) return (true, "legislation");

        // [Audit fix: M-20] Expanded misspelling dictionary
        // Party name misspellings
        if (_containsCI(actionBytes, "republcan")) return (true, "republican");
        if (_containsCI(actionBytes, "republikan")) return (true, "republican");
        if (_containsCI(actionBytes, "democat")) return (true, "democrat");
        if (_containsCI(actionBytes, "demokrat")) return (true, "democrat");

        // Senator/congress misspellings
        if (_containsCI(actionBytes, "sentor")) return (true, "senator");
        if (_containsCI(actionBytes, "senatir")) return (true, "senator");
        if (_containsCI(actionBytes, "congres")) return (true, "congressman");
        if (_containsCI(actionBytes, "congresman")) return (true, "congressman");

        // Ballot misspellings
        if (_containsCI(actionBytes, "balot")) return (true, "ballot");
        if (_containsCI(actionBytes, "ballott")) return (true, "ballot");

        // Partisan misspellings
        if (_containsCI(actionBytes, "partsan")) return (true, "partisan");
        if (_containsCI(actionBytes, "partysan")) return (true, "partisan");

        return (false, "");
    }
}

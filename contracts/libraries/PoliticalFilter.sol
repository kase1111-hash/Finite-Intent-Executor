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
        if (_containsCI(actionBytes, "vote")) return (true, "vote");
        if (_containsCI(actionBytes, "voting")) return (true, "voting");
        if (_containsCI(actionBytes, "voter")) return (true, "voter");

        // Lobbying keywords
        if (_containsCI(actionBytes, "lobby")) return (true, "lobby");
        if (_containsCI(actionBytes, "lobbying")) return (true, "lobbying");
        if (_containsCI(actionBytes, "lobbyist")) return (true, "lobbyist");

        // Political keywords
        if (_containsCI(actionBytes, "political")) return (true, "political");
        if (_containsCI(actionBytes, "politician")) return (true, "politician");
        if (_containsCI(actionBytes, "partisan")) return (true, "partisan");

        // Policy keywords
        if (_containsCI(actionBytes, "policy")) return (true, "policy");
        if (_containsCI(actionBytes, "legislation")) return (true, "legislation");
        if (_containsCI(actionBytes, "legislative")) return (true, "legislative");
        if (_containsCI(actionBytes, "lawmaker")) return (true, "lawmaker");

        // Government keywords
        if (_containsCI(actionBytes, "government")) return (true, "government");
        if (_containsCI(actionBytes, "senator")) return (true, "senator");
        if (_containsCI(actionBytes, "congressman")) return (true, "congressman");
        if (_containsCI(actionBytes, "parliament")) return (true, "parliament");

        return (false, "");
    }

    // ============================================================
    // SECONDARY KEYWORDS (Context-dependent political terms)
    // ============================================================

    /**
     * @dev Secondary keywords that may indicate political activity
     * when combined with other indicators
     */
    function _isSecondaryPoliticalKeyword(bytes memory actionBytes) internal pure returns (bool, string memory) {
        // Advocacy terms
        if (_containsCI(actionBytes, "advocacy")) return (true, "advocacy");
        if (_containsCI(actionBytes, "advocate")) return (true, "advocate");
        if (_containsCI(actionBytes, "endorse")) return (true, "endorse");
        if (_containsCI(actionBytes, "endorsement")) return (true, "endorsement");

        // Regulatory terms
        if (_containsCI(actionBytes, "regulatory")) return (true, "regulatory");
        if (_containsCI(actionBytes, "regulation")) return (true, "regulation");
        if (_containsCI(actionBytes, "deregulation")) return (true, "deregulation");

        // Influence terms
        if (_containsCI(actionBytes, "influence")) return (true, "influence");
        if (_containsCI(actionBytes, "persuade")) return (true, "persuade");
        if (_containsCI(actionBytes, "sway")) return (true, "sway");

        // Party terms
        if (_containsCI(actionBytes, "republican")) return (true, "republican");
        if (_containsCI(actionBytes, "democrat")) return (true, "democrat");
        if (_containsCI(actionBytes, "conservative")) return (true, "conservative");
        if (_containsCI(actionBytes, "liberal")) return (true, "liberal");

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
     * @dev Main filter function - performs comprehensive political activity check
     * @param action The action string to check
     * @return result FilterResult struct with detection details
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
        // Unicode homoglyphs like Cyrillic 'р' (U+0440) can bypass ASCII keyword filters
        if (_containsSuspiciousCharacters(actionBytes)) {
            return FilterResult({
                isProhibited: true,
                category: PoliticalCategory.None,
                matchedTerm: "suspicious_characters",
                confidenceScore: 80
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

        // Layer 4: Check secondary keywords
        (bool secondaryMatch, string memory secondaryTerm) = _isSecondaryPoliticalKeyword(actionBytes);
        if (secondaryMatch) {
            return FilterResult({
                isProhibited: true,
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
     * @notice Detects multi-byte UTF-8 sequences that might contain look-alike characters
     *         Cyrillic, Greek, and other scripts have characters visually similar to Latin
     *         Examples: Cyrillic 'а' (U+0430) looks like Latin 'a'
     *                   Cyrillic 'р' (U+0440) looks like Latin 'p'
     */
    function _containsSuspiciousCharacters(bytes memory str) private pure returns (bool) {
        for (uint256 i = 0; i < str.length; i++) {
            uint8 b = uint8(str[i]);

            // Multi-byte UTF-8 sequences start with bytes >= 0x80
            // Valid ASCII is 0x00-0x7F (0-127)
            // UTF-8 continuation bytes are 0x80-0xBF
            // UTF-8 leading bytes for multi-byte sequences are 0xC0-0xFF

            // Detect multi-byte UTF-8 leading bytes (non-ASCII characters)
            if (b >= 0xC0) {
                // This is a multi-byte UTF-8 character
                // Could be Cyrillic (U+0400-U+04FF), Greek (U+0370-U+03FF), etc.
                // These are often used for homoglyph attacks
                return true;
            }

            // Also flag high bytes that shouldn't appear in normal text
            if (b >= 0x80 && b < 0xC0) {
                // Unexpected UTF-8 continuation byte without leading byte
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
        if (_containsCI(actionBytes, "lobbying")) return (true, "lobbying");
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

        return (false, "");
    }
}

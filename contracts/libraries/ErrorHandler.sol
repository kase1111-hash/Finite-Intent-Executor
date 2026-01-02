// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ErrorHandler
 * @author Finite Intent Executor
 * @dev Comprehensive error handling library for the FIE protocol
 *
 * Features:
 * - Standardized error codes and messages
 * - Categorized error types for SIEM integration
 * - Severity levels for alert prioritization
 * - Structured error data for off-chain processing
 *
 * Error Categories:
 * - AUTH: Authentication and authorization errors
 * - INTENT: Intent capture and management errors
 * - TRIGGER: Trigger mechanism errors
 * - EXEC: Execution agent errors
 * - SUNSET: Sunset protocol errors
 * - CORPUS: Lexicon and corpus errors
 * - TOKEN: IP token errors
 * - POLITICAL: Political filter violations
 * - CONFIDENCE: Confidence threshold errors
 * - SYSTEM: System-level errors
 */
library ErrorHandler {
    // ============================================================
    // ERROR SEVERITY LEVELS (aligned with Boundary-SIEM schema)
    // ============================================================

    uint8 public constant SEVERITY_DEBUG = 1;
    uint8 public constant SEVERITY_INFO = 2;
    uint8 public constant SEVERITY_NOTICE = 3;
    uint8 public constant SEVERITY_WARNING = 4;
    uint8 public constant SEVERITY_ERROR = 5;
    uint8 public constant SEVERITY_CRITICAL = 8;
    uint8 public constant SEVERITY_ALERT = 9;
    uint8 public constant SEVERITY_EMERGENCY = 10;

    // ============================================================
    // ERROR CATEGORIES
    // ============================================================

    enum ErrorCategory {
        AUTH,       // Authentication/Authorization
        INTENT,     // Intent management
        TRIGGER,    // Trigger mechanism
        EXEC,       // Execution agent
        SUNSET,     // Sunset protocol
        CORPUS,     // Lexicon/corpus
        TOKEN,      // IP token
        POLITICAL,  // Political filtering
        CONFIDENCE, // Confidence threshold
        SYSTEM      // System errors
    }

    // ============================================================
    // ERROR CODES
    // ============================================================

    // Authentication/Authorization Errors (1xx)
    uint256 public constant ERR_UNAUTHORIZED = 100;
    uint256 public constant ERR_INVALID_ROLE = 101;
    uint256 public constant ERR_ACCESS_DENIED = 102;
    uint256 public constant ERR_INVALID_SIGNATURE = 103;
    uint256 public constant ERR_EXPIRED_TOKEN = 104;

    // Intent Errors (2xx)
    uint256 public constant ERR_INTENT_NOT_FOUND = 200;
    uint256 public constant ERR_INTENT_ALREADY_EXISTS = 201;
    uint256 public constant ERR_INTENT_REVOKED = 202;
    uint256 public constant ERR_INTENT_TRIGGERED = 203;
    uint256 public constant ERR_INVALID_CORPUS_WINDOW = 204;
    uint256 public constant ERR_NO_ASSETS = 205;
    uint256 public constant ERR_INVALID_PRIORITY = 206;

    // Trigger Errors (3xx)
    uint256 public constant ERR_TRIGGER_NOT_CONFIGURED = 300;
    uint256 public constant ERR_TRIGGER_ALREADY_TRIGGERED = 301;
    uint256 public constant ERR_INVALID_TRIGGER_TYPE = 302;
    uint256 public constant ERR_DEADMAN_NOT_ELAPSED = 303;
    uint256 public constant ERR_INSUFFICIENT_SIGNATURES = 304;
    uint256 public constant ERR_NOT_TRUSTED_SIGNER = 305;
    uint256 public constant ERR_ALREADY_SIGNED = 306;
    uint256 public constant ERR_INVALID_ORACLE = 307;
    uint256 public constant ERR_VERIFICATION_FAILED = 308;

    // Execution Errors (4xx)
    uint256 public constant ERR_EXECUTION_NOT_ACTIVE = 400;
    uint256 public constant ERR_ALREADY_ACTIVATED = 401;
    uint256 public constant ERR_POLITICAL_VIOLATION = 402;
    uint256 public constant ERR_LOW_CONFIDENCE = 403;
    uint256 public constant ERR_INSUFFICIENT_FUNDS = 404;
    uint256 public constant ERR_TRANSFER_FAILED = 405;
    uint256 public constant ERR_INVALID_ROYALTY = 406;

    // Sunset Errors (5xx)
    uint256 public constant ERR_SUNSET_NOT_DUE = 500;
    uint256 public constant ERR_ALREADY_SUNSET = 501;
    uint256 public constant ERR_SUNSET_NOT_INITIATED = 502;
    uint256 public constant ERR_ASSETS_NOT_ARCHIVED = 503;
    uint256 public constant ERR_IP_NOT_TRANSITIONED = 504;
    uint256 public constant ERR_NOT_CLUSTERED = 505;

    // Corpus Errors (6xx)
    uint256 public constant ERR_CORPUS_NOT_FROZEN = 600;
    uint256 public constant ERR_CORPUS_ALREADY_FROZEN = 601;
    uint256 public constant ERR_CORPUS_HASH_MISMATCH = 602;
    uint256 public constant ERR_INVALID_TIME_WINDOW = 603;
    uint256 public constant ERR_CLUSTER_NOT_FOUND = 604;
    uint256 public constant ERR_CLUSTER_EXISTS = 605;

    // Token Errors (7xx)
    uint256 public constant ERR_TOKEN_NOT_FOUND = 700;
    uint256 public constant ERR_ALREADY_PUBLIC_DOMAIN = 701;
    uint256 public constant ERR_INVALID_LICENSE = 702;
    uint256 public constant ERR_LICENSE_EXPIRED = 703;
    uint256 public constant ERR_ZERO_PAYMENT = 704;

    // System Errors (9xx)
    uint256 public constant ERR_INVALID_ADDRESS = 900;
    uint256 public constant ERR_ARRAY_LENGTH_MISMATCH = 901;
    uint256 public constant ERR_REENTRANCY = 902;
    uint256 public constant ERR_OVERFLOW = 903;
    uint256 public constant ERR_UNDERFLOW = 904;

    // ============================================================
    // ERROR DATA STRUCTURE
    // ============================================================

    struct ErrorData {
        uint256 code;
        ErrorCategory category;
        uint8 severity;
        string message;
        address actor;
        address target;
        uint256 timestamp;
        bytes32 correlationId;
    }

    // ============================================================
    // EVENTS FOR SIEM INTEGRATION
    // ============================================================

    event SecurityError(
        uint256 indexed code,
        ErrorCategory indexed category,
        uint8 severity,
        string message,
        address actor,
        address target,
        bytes32 correlationId
    );

    event PoliticalViolation(
        address indexed actor,
        string action,
        string matchedTerm,
        uint8 category
    );

    event ConfidenceFailure(
        address indexed creator,
        string action,
        uint256 confidence,
        uint256 threshold
    );

    event AccessDenied(
        address indexed actor,
        bytes4 selector,
        bytes32 requiredRole
    );

    event SystemAnomaly(
        uint256 indexed code,
        string description,
        bytes data
    );

    // ============================================================
    // ERROR CREATION FUNCTIONS
    // ============================================================

    /**
     * @dev Creates an ErrorData struct with full context
     */
    function createError(
        uint256 code,
        ErrorCategory category,
        uint8 severity,
        string memory message,
        address actor,
        address target
    ) internal view returns (ErrorData memory) {
        return ErrorData({
            code: code,
            category: category,
            severity: severity,
            message: message,
            actor: actor,
            target: target,
            timestamp: block.timestamp,
            correlationId: keccak256(abi.encodePacked(
                block.number,
                block.timestamp,
                tx.origin,
                msg.sender,
                code
            ))
        });
    }

    /**
     * @dev Get severity level for an error code
     */
    function getSeverity(uint256 code) internal pure returns (uint8) {
        // Political violations are critical
        if (code == ERR_POLITICAL_VIOLATION) return SEVERITY_CRITICAL;

        // Security-related errors are high severity
        if (code == ERR_UNAUTHORIZED ||
            code == ERR_ACCESS_DENIED ||
            code == ERR_INVALID_SIGNATURE ||
            code == ERR_REENTRANCY) return SEVERITY_ALERT;

        // Financial errors are high severity
        if (code == ERR_TRANSFER_FAILED ||
            code == ERR_INSUFFICIENT_FUNDS) return SEVERITY_ERROR;

        // State transition errors are medium
        if (code >= 200 && code < 300) return SEVERITY_WARNING;
        if (code >= 300 && code < 400) return SEVERITY_WARNING;
        if (code >= 500 && code < 600) return SEVERITY_WARNING;

        // System errors are critical
        if (code >= 900) return SEVERITY_CRITICAL;

        // Default to notice level
        return SEVERITY_NOTICE;
    }

    /**
     * @dev Get category for an error code
     */
    function getCategory(uint256 code) internal pure returns (ErrorCategory) {
        if (code >= 100 && code < 200) return ErrorCategory.AUTH;
        if (code >= 200 && code < 300) return ErrorCategory.INTENT;
        if (code >= 300 && code < 400) return ErrorCategory.TRIGGER;
        if (code >= 400 && code < 500) return ErrorCategory.EXEC;
        if (code >= 500 && code < 600) return ErrorCategory.SUNSET;
        if (code >= 600 && code < 700) return ErrorCategory.CORPUS;
        if (code >= 700 && code < 800) return ErrorCategory.TOKEN;
        if (code >= 900) return ErrorCategory.SYSTEM;
        return ErrorCategory.SYSTEM;
    }

    /**
     * @dev Get human-readable message for an error code
     */
    function getMessage(uint256 code) internal pure returns (string memory) {
        // Auth errors
        if (code == ERR_UNAUTHORIZED) return "Unauthorized access attempt";
        if (code == ERR_INVALID_ROLE) return "Invalid role for operation";
        if (code == ERR_ACCESS_DENIED) return "Access denied";
        if (code == ERR_INVALID_SIGNATURE) return "Invalid signature";

        // Intent errors
        if (code == ERR_INTENT_NOT_FOUND) return "Intent not found";
        if (code == ERR_INTENT_REVOKED) return "Intent has been revoked";
        if (code == ERR_INTENT_TRIGGERED) return "Intent already triggered";
        if (code == ERR_INVALID_CORPUS_WINDOW) return "Invalid corpus window (must be 5-10 years)";

        // Trigger errors
        if (code == ERR_TRIGGER_NOT_CONFIGURED) return "Trigger not configured";
        if (code == ERR_TRIGGER_ALREADY_TRIGGERED) return "Already triggered";
        if (code == ERR_DEADMAN_NOT_ELAPSED) return "Deadman interval not elapsed";
        if (code == ERR_NOT_TRUSTED_SIGNER) return "Not a trusted signer";

        // Execution errors
        if (code == ERR_EXECUTION_NOT_ACTIVE) return "Execution not active or sunset";
        if (code == ERR_POLITICAL_VIOLATION) return "Political agency clause violation";
        if (code == ERR_LOW_CONFIDENCE) return "Confidence below threshold";
        if (code == ERR_INSUFFICIENT_FUNDS) return "Insufficient treasury funds";
        if (code == ERR_TRANSFER_FAILED) return "Transfer failed";

        // Sunset errors
        if (code == ERR_SUNSET_NOT_DUE) return "20-year duration not elapsed";
        if (code == ERR_ALREADY_SUNSET) return "Already sunset";

        // Corpus errors
        if (code == ERR_CORPUS_NOT_FROZEN) return "Corpus not frozen";
        if (code == ERR_CORPUS_HASH_MISMATCH) return "Corpus hash mismatch";

        // Token errors
        if (code == ERR_TOKEN_NOT_FOUND) return "Token does not exist";
        if (code == ERR_ALREADY_PUBLIC_DOMAIN) return "Already in public domain";

        // System errors
        if (code == ERR_INVALID_ADDRESS) return "Invalid address";
        if (code == ERR_ARRAY_LENGTH_MISMATCH) return "Array length mismatch";
        if (code == ERR_REENTRANCY) return "Reentrancy detected";

        return "Unknown error";
    }

    // ============================================================
    // CUSTOM ERRORS (Gas-efficient)
    // ============================================================

    error Unauthorized(address caller, bytes32 requiredRole);
    error IntentNotFound(address creator);
    error IntentRevoked(address creator);
    error IntentAlreadyTriggered(address creator);
    error InvalidCorpusWindow(uint256 start, uint256 end, uint256 minYears, uint256 maxYears);
    error TriggerNotConfigured(address creator);
    error AlreadyTriggered(address creator);
    error DeadmanNotElapsed(uint256 lastCheckIn, uint256 interval, uint256 currentTime);
    error NotTrustedSigner(address signer, address creator);
    error ExecutionNotActive(address creator, bool isSunset, uint256 triggerTime);
    error PoliticalViolationError(string action, string matchedTerm);
    error LowConfidence(uint256 confidence, uint256 threshold);
    error InsufficientFunds(uint256 requested, uint256 available);
    error TransferFailed(address recipient, uint256 amount);
    error SunsetNotDue(uint256 triggerTime, uint256 requiredDuration, uint256 currentTime);
    error CorpusNotFrozen(address creator);
    error CorpusHashMismatch(bytes32 expected, bytes32 provided);
    error TokenNotFound(uint256 tokenId);
    error InvalidAddress(address addr);
    error ArrayLengthMismatch(uint256 length1, uint256 length2);

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    /**
     * @dev Formats error data for CEF (Common Event Format) logging
     * Compatible with Boundary-SIEM CEF ingestion
     */
    function toCEF(ErrorData memory err) internal pure returns (string memory) {
        // CEF format: CEF:Version|Vendor|Product|Version|SignatureID|Name|Severity|Extensions
        return string(abi.encodePacked(
            "CEF:0|FIE|FiniteIntentExecutor|1.0|",
            _uint256ToString(err.code),
            "|",
            err.message,
            "|",
            _uint256ToString(uint256(err.severity)),
            "|",
            "cat=", _categoryToString(err.category),
            " src=", _addressToString(err.actor),
            " dst=", _addressToString(err.target)
        ));
    }

    /**
     * @dev Convert category enum to string
     */
    function _categoryToString(ErrorCategory cat) private pure returns (string memory) {
        if (cat == ErrorCategory.AUTH) return "AUTH";
        if (cat == ErrorCategory.INTENT) return "INTENT";
        if (cat == ErrorCategory.TRIGGER) return "TRIGGER";
        if (cat == ErrorCategory.EXEC) return "EXEC";
        if (cat == ErrorCategory.SUNSET) return "SUNSET";
        if (cat == ErrorCategory.CORPUS) return "CORPUS";
        if (cat == ErrorCategory.TOKEN) return "TOKEN";
        if (cat == ErrorCategory.POLITICAL) return "POLITICAL";
        if (cat == ErrorCategory.CONFIDENCE) return "CONFIDENCE";
        return "SYSTEM";
    }

    /**
     * @dev Convert uint256 to string
     */
    function _uint256ToString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    /**
     * @dev Convert address to string
     */
    function _addressToString(address addr) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory data = abi.encodePacked(addr);
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOracle
 * @dev Standard interface for oracle adapters in the Finite Intent Executor
 * @notice All oracle implementations must implement this interface
 */
interface IOracle {
    /**
     * @dev Enum for verification event types
     */
    enum EventType {
        Death,              // Death certificate verification
        Incapacitation,     // Medical incapacitation
        LegalEvent,         // Court ruling, probate, etc.
        Custom              // Custom event type
    }

    /**
     * @dev Enum for verification status
     */
    enum VerificationStatus {
        Pending,            // Request submitted, awaiting response
        Verified,           // Event verified as true
        Rejected,           // Event verification failed
        Disputed,           // Verification is under dispute
        Expired             // Request expired without resolution
    }

    /**
     * @dev Struct for verification request
     */
    struct VerificationRequest {
        bytes32 requestId;
        address creator;
        EventType eventType;
        bytes32 dataHash;           // Hash of off-chain data for privacy
        uint256 requestTimestamp;
        uint256 expirationTimestamp;
        VerificationStatus status;
        uint256 confidenceScore;    // 0-100, must be >= 95 for trigger
    }

    /**
     * @dev Emitted when a verification request is created
     */
    event VerificationRequested(
        bytes32 indexed requestId,
        address indexed creator,
        EventType eventType,
        uint256 timestamp
    );

    /**
     * @dev Emitted when verification is fulfilled
     */
    event VerificationFulfilled(
        bytes32 indexed requestId,
        address indexed creator,
        VerificationStatus status,
        uint256 confidenceScore
    );

    /**
     * @dev Emitted when verification is disputed
     */
    event VerificationDisputed(
        bytes32 indexed requestId,
        address indexed disputer,
        string reason
    );

    /**
     * @dev Request verification of an event
     * @param _creator Address of the intent creator
     * @param _eventType Type of event to verify
     * @param _dataHash Hash of supporting data (stored off-chain for privacy)
     * @return requestId Unique identifier for the request
     */
    function requestVerification(
        address _creator,
        EventType _eventType,
        bytes32 _dataHash
    ) external returns (bytes32 requestId);

    /**
     * @dev Get the status of a verification request
     * @param _requestId The request identifier
     * @return request The verification request details
     */
    function getVerificationStatus(bytes32 _requestId)
        external view returns (VerificationRequest memory request);

    /**
     * @dev Check if a verification meets the threshold for trigger
     * @param _requestId The request identifier
     * @return isValid True if verification is valid and confidence >= 95%
     */
    function isVerificationValid(bytes32 _requestId)
        external view returns (bool isValid);

    /**
     * @dev Get the oracle type identifier
     * @return oracleType String identifier (e.g., "chainlink", "uma", "zk")
     */
    function getOracleType() external pure returns (string memory oracleType);

    /**
     * @dev Check if oracle is currently active and operational
     * @return isActive True if oracle can accept new requests
     */
    function isActive() external view returns (bool isActive);
}

/**
 * Finite Intent Executor - Security Module
 *
 * Unified security integration for the FIE platform providing:
 * - SIEM reporting via Boundary-SIEM
 * - Connection protection via Boundary-Daemon
 * - Express middleware for API security
 * - Error handling aligned with security events
 *
 * @author Finite Intent Executor
 * @version 1.0.0
 *
 * Usage:
 * ```javascript
 * const {
 *   createSecurityIntegration,
 *   createSecurityMiddleware,
 *   securityHeaders
 * } = require('./security');
 *
 * // Create unified security client
 * const security = createSecurityIntegration({
 *   siem: { apiUrl: 'http://localhost:8080' },
 *   daemon: { socketPath: '/var/run/boundary-daemon/daemon.sock' }
 * });
 *
 * // Connect to services
 * await security.connect();
 *
 * // Use middleware in Express
 * app.use(securityHeaders());
 * app.use(createSecurityMiddleware({ security }));
 *
 * // Report events
 * await security.reportIntentCaptured({ creatorAddress, intentHash });
 *
 * // Protect operations
 * const result = await security.protectExecution(creatorAddress, 'fund_project', data);
 * if (!result.allowed) {
 *   throw new Error(result.reason);
 * }
 * ```
 */

// Core clients
const BoundarySIEMClient = require('./clients/BoundarySIEMClient');
const BoundaryDaemonClient = require('./clients/BoundaryDaemonClient');

// Unified integration
const {
  SecurityIntegration,
  createSecurityIntegration,
  SecuritySeverity,
  SecurityCategory,
  ProtectionResult
} = require('./SecurityIntegration');

// Middleware
const {
  createSecurityMiddleware,
  securityHeaders,
  validateRequest,
  secureCors,
  protectBlockchainOperations,
  auditLog
} = require('./middleware/SecurityMiddleware');

// ============================================================
// CONVENIENCE FACTORY
// ============================================================

/**
 * Create a fully configured security setup for FIE
 * @param {Object} options - Configuration options
 * @returns {Object} Configured security components
 */
function createFIESecurity(options = {}) {
  const security = createSecurityIntegration({
    siem: {
      apiUrl: process.env.BOUNDARY_SIEM_URL || options.siemUrl || 'http://localhost:8080',
      apiKey: process.env.BOUNDARY_SIEM_API_KEY || options.siemApiKey,
      transport: options.siemTransport || 'rest'
    },
    daemon: {
      socketPath: process.env.BOUNDARY_DAEMON_SOCKET || options.daemonSocket,
      host: process.env.BOUNDARY_DAEMON_HOST || options.daemonHost,
      port: process.env.BOUNDARY_DAEMON_PORT
        ? parseInt(process.env.BOUNDARY_DAEMON_PORT)
        : options.daemonPort
    },
    failClosed: options.failClosed !== false,
    enabled: options.enabled !== false
  });

  const middleware = {
    security: createSecurityMiddleware({ security, ...options.middleware }),
    headers: securityHeaders(options.headers),
    validate: validateRequest(options.validation),
    cors: secureCors(options.cors),
    blockchain: protectBlockchainOperations({ security, ...options.blockchain }),
    audit: auditLog({ security, ...options.audit })
  };

  return {
    security,
    middleware,

    // Convenience method to apply all middleware to Express app
    applyTo(app) {
      app.use(middleware.headers);
      app.use(middleware.cors);
      app.use(middleware.validate);
      app.use(middleware.security);
      app.use(middleware.blockchain);
      app.use(middleware.audit);
      return app;
    },

    // Connect to all services
    async connect() {
      return security.connect();
    },

    // Disconnect from all services
    async disconnect() {
      return security.disconnect();
    },

    // Health check
    async healthCheck() {
      return security.healthCheck();
    }
  };
}

// ============================================================
// ERROR CODES (aligned with ErrorHandler.sol)
// ============================================================

const ErrorCodes = {
  // Authentication/Authorization Errors (1xx)
  ERR_UNAUTHORIZED: 100,
  ERR_INVALID_ROLE: 101,
  ERR_ACCESS_DENIED: 102,
  ERR_INVALID_SIGNATURE: 103,
  ERR_EXPIRED_TOKEN: 104,

  // Intent Errors (2xx)
  ERR_INTENT_NOT_FOUND: 200,
  ERR_INTENT_ALREADY_EXISTS: 201,
  ERR_INTENT_REVOKED: 202,
  ERR_INTENT_TRIGGERED: 203,
  ERR_INVALID_CORPUS_WINDOW: 204,
  ERR_NO_ASSETS: 205,
  ERR_INVALID_PRIORITY: 206,

  // Trigger Errors (3xx)
  ERR_TRIGGER_NOT_CONFIGURED: 300,
  ERR_TRIGGER_ALREADY_TRIGGERED: 301,
  ERR_INVALID_TRIGGER_TYPE: 302,
  ERR_DEADMAN_NOT_ELAPSED: 303,
  ERR_INSUFFICIENT_SIGNATURES: 304,
  ERR_NOT_TRUSTED_SIGNER: 305,
  ERR_ALREADY_SIGNED: 306,
  ERR_INVALID_ORACLE: 307,
  ERR_VERIFICATION_FAILED: 308,

  // Execution Errors (4xx)
  ERR_EXECUTION_NOT_ACTIVE: 400,
  ERR_ALREADY_ACTIVATED: 401,
  ERR_POLITICAL_VIOLATION: 402,
  ERR_LOW_CONFIDENCE: 403,
  ERR_INSUFFICIENT_FUNDS: 404,
  ERR_TRANSFER_FAILED: 405,
  ERR_INVALID_ROYALTY: 406,

  // Sunset Errors (5xx)
  ERR_SUNSET_NOT_DUE: 500,
  ERR_ALREADY_SUNSET: 501,
  ERR_SUNSET_NOT_INITIATED: 502,
  ERR_ASSETS_NOT_ARCHIVED: 503,
  ERR_IP_NOT_TRANSITIONED: 504,
  ERR_NOT_CLUSTERED: 505,

  // Corpus Errors (6xx)
  ERR_CORPUS_NOT_FROZEN: 600,
  ERR_CORPUS_ALREADY_FROZEN: 601,
  ERR_CORPUS_HASH_MISMATCH: 602,
  ERR_INVALID_TIME_WINDOW: 603,
  ERR_CLUSTER_NOT_FOUND: 604,
  ERR_CLUSTER_EXISTS: 605,

  // Token Errors (7xx)
  ERR_TOKEN_NOT_FOUND: 700,
  ERR_ALREADY_PUBLIC_DOMAIN: 701,
  ERR_INVALID_LICENSE: 702,
  ERR_LICENSE_EXPIRED: 703,
  ERR_ZERO_PAYMENT: 704,

  // System Errors (9xx)
  ERR_INVALID_ADDRESS: 900,
  ERR_ARRAY_LENGTH_MISMATCH: 901,
  ERR_REENTRANCY: 902,
  ERR_OVERFLOW: 903,
  ERR_UNDERFLOW: 904
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Clients
  BoundarySIEMClient,
  BoundaryDaemonClient,

  // Integration
  SecurityIntegration,
  createSecurityIntegration,
  SecuritySeverity,
  SecurityCategory,
  ProtectionResult,

  // Middleware
  createSecurityMiddleware,
  securityHeaders,
  validateRequest,
  secureCors,
  protectBlockchainOperations,
  auditLog,

  // Factory
  createFIESecurity,

  // Error codes
  ErrorCodes
};

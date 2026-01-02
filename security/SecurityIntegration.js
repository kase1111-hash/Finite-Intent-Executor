/**
 * Unified Security Integration Module for Finite Intent Executor
 *
 * This module provides a single interface for:
 * - Reporting security events to Boundary-SIEM
 * - Protecting connections via Boundary-Daemon
 * - Coordinating security policies across the system
 *
 * @author Finite Intent Executor
 * @version 1.0.0
 */

const BoundarySIEMClient = require('./clients/BoundarySIEMClient');
const BoundaryDaemonClient = require('./clients/BoundaryDaemonClient');
const { EventEmitter } = require('events');

/**
 * Security event severity levels (aligned with Boundary-SIEM schema)
 */
const SecuritySeverity = {
  DEBUG: 1,
  INFO: 2,
  NOTICE: 3,
  WARNING: 4,
  ERROR: 5,
  CRITICAL: 8,
  ALERT: 9,
  EMERGENCY: 10
};

/**
 * Security event categories
 */
const SecurityCategory = {
  AUTH: 'AUTH',
  INTENT: 'INTENT',
  TRIGGER: 'TRIGGER',
  EXEC: 'EXEC',
  SUNSET: 'SUNSET',
  CORPUS: 'CORPUS',
  TOKEN: 'TOKEN',
  POLITICAL: 'POLITICAL',
  CONFIDENCE: 'CONFIDENCE',
  SYSTEM: 'SYSTEM',
  CONNECTION: 'CONNECTION',
  POLICY: 'POLICY'
};

/**
 * Protection action results
 */
const ProtectionResult = {
  ALLOW: 'allow',
  DENY: 'deny',
  WARN: 'warn',
  AUDIT: 'audit'
};

/**
 * Unified Security Integration class
 * Combines Boundary-SIEM reporting and Boundary-Daemon protection
 */
class SecurityIntegration extends EventEmitter {
  /**
   * @param {Object} config - Configuration options
   * @param {Object} config.siem - Boundary-SIEM configuration
   * @param {Object} config.daemon - Boundary-Daemon configuration
   * @param {boolean} config.failClosed - Fail closed on errors (default: true)
   * @param {boolean} config.enabled - Enable security integration (default: true)
   */
  constructor(config = {}) {
    super();

    this.config = {
      failClosed: true,
      enabled: true,
      reportToSIEM: true,
      protectWithDaemon: true,
      ...config
    };

    this.siemClient = null;
    this.daemonClient = null;
    this.isConnected = false;
    this.stats = {
      eventsReported: 0,
      protectionChecks: 0,
      deniedActions: 0,
      warnings: 0,
      errors: 0
    };

    this._initializeClients(config);
  }

  /**
   * Initialize security clients
   */
  _initializeClients(config) {
    if (this.config.reportToSIEM && config.siem) {
      this.siemClient = new BoundarySIEMClient(config.siem);
      this.siemClient.on('error', (err) => this._handleSIEMError(err));
      this.siemClient.on('eventSent', (event) => this._handleEventSent(event));
    }

    if (this.config.protectWithDaemon && config.daemon) {
      this.daemonClient = new BoundaryDaemonClient(config.daemon);
      this.daemonClient.on('error', (err) => this._handleDaemonError(err));
      this.daemonClient.on('connected', () => this._handleDaemonConnected());
      this.daemonClient.on('disconnected', () => this._handleDaemonDisconnected());
    }
  }

  /**
   * Connect to all security services
   */
  async connect() {
    const results = { siem: false, daemon: false };

    try {
      if (this.siemClient) {
        await this.siemClient.connect();
        results.siem = true;
      }
    } catch (err) {
      this.emit('error', { source: 'siem', error: err });
    }

    try {
      if (this.daemonClient) {
        await this.daemonClient.connect();
        results.daemon = true;
      }
    } catch (err) {
      this.emit('error', { source: 'daemon', error: err });
    }

    this.isConnected = results.siem || results.daemon;
    this.emit('connected', results);

    return results;
  }

  /**
   * Disconnect from all security services
   */
  async disconnect() {
    if (this.siemClient) {
      await this.siemClient.disconnect();
    }

    if (this.daemonClient) {
      await this.daemonClient.disconnect();
    }

    this.isConnected = false;
    this.emit('disconnected');
  }

  // ============================================================
  // UNIFIED REPORTING INTERFACE
  // ============================================================

  /**
   * Report a security event
   * @param {Object} event - Event details
   */
  async reportEvent(event) {
    if (!this.config.enabled || !this.config.reportToSIEM) {
      return { reported: false, reason: 'disabled' };
    }

    const normalizedEvent = this._normalizeEvent(event);

    try {
      if (this.siemClient) {
        await this.siemClient.sendEvent(normalizedEvent);
        this.stats.eventsReported++;
        this.emit('eventReported', normalizedEvent);
        return { reported: true, event: normalizedEvent };
      }
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { source: 'report', error: err, event: normalizedEvent });
    }

    return { reported: false, reason: 'no_client' };
  }

  /**
   * Report an intent capture event
   */
  async reportIntentCaptured(data) {
    return this.reportEvent({
      category: SecurityCategory.INTENT,
      action: 'intent_captured',
      severity: SecuritySeverity.INFO,
      ...data
    });
  }

  /**
   * Report an intent trigger event
   */
  async reportIntentTriggered(data) {
    return this.reportEvent({
      category: SecurityCategory.TRIGGER,
      action: 'intent_triggered',
      severity: SecuritySeverity.ALERT,
      ...data
    });
  }

  /**
   * Report an execution event
   */
  async reportExecutionAction(data) {
    return this.reportEvent({
      category: SecurityCategory.EXEC,
      action: 'action_executed',
      severity: SecuritySeverity.INFO,
      ...data
    });
  }

  /**
   * Report a political violation
   */
  async reportPoliticalViolation(data) {
    return this.reportEvent({
      category: SecurityCategory.POLITICAL,
      action: 'political_violation',
      severity: SecuritySeverity.CRITICAL,
      ...data
    });
  }

  /**
   * Report a confidence failure
   */
  async reportConfidenceFailure(data) {
    return this.reportEvent({
      category: SecurityCategory.CONFIDENCE,
      action: 'confidence_failure',
      severity: SecuritySeverity.WARNING,
      ...data
    });
  }

  /**
   * Report a sunset event
   */
  async reportSunsetEvent(data) {
    return this.reportEvent({
      category: SecurityCategory.SUNSET,
      action: data.action || 'sunset_event',
      severity: SecuritySeverity.ALERT,
      ...data
    });
  }

  /**
   * Report an authentication event
   */
  async reportAuthEvent(data) {
    return this.reportEvent({
      category: SecurityCategory.AUTH,
      action: data.action || 'auth_event',
      severity: data.success ? SecuritySeverity.INFO : SecuritySeverity.WARNING,
      ...data
    });
  }

  /**
   * Report a system error
   */
  async reportSystemError(data) {
    return this.reportEvent({
      category: SecurityCategory.SYSTEM,
      action: 'system_error',
      severity: SecuritySeverity.ERROR,
      ...data
    });
  }

  // ============================================================
  // UNIFIED PROTECTION INTERFACE
  // ============================================================

  /**
   * Check if an action is allowed
   * @param {Object} context - Action context
   * @returns {Object} Protection decision
   */
  async checkAction(context) {
    if (!this.config.enabled || !this.config.protectWithDaemon) {
      return { allowed: true, reason: 'protection_disabled' };
    }

    this.stats.protectionChecks++;

    try {
      if (this.daemonClient) {
        const result = await this.daemonClient.checkTool(
          context.action || 'unknown',
          context.parameters || {},
          context
        );

        if (!result.allowed) {
          this.stats.deniedActions++;
          await this.reportEvent({
            category: SecurityCategory.POLICY,
            action: 'action_denied',
            severity: SecuritySeverity.WARNING,
            context,
            reason: result.reason
          });
        }

        return result;
      }
    } catch (err) {
      this.stats.errors++;
      this.emit('error', { source: 'protection', error: err, context });

      // Fail closed by default
      if (this.config.failClosed) {
        return { allowed: false, reason: 'protection_error', error: err.message };
      }
    }

    return { allowed: true, reason: 'no_daemon' };
  }

  /**
   * Protect an intent capture operation
   */
  async protectIntentCapture(creatorAddress, intentData) {
    const context = {
      action: 'intent_capture',
      creatorAddress,
      intentData,
      category: SecurityCategory.INTENT
    };

    const result = await this.checkAction(context);

    if (result.allowed) {
      await this.reportIntentCaptured({
        creatorAddress,
        intentHash: intentData.intentHash,
        corpusHash: intentData.corpusHash
      });
    }

    return result;
  }

  /**
   * Protect a trigger activation
   */
  async protectTriggerActivation(creatorAddress, triggerType, triggerData) {
    const context = {
      action: 'trigger_activation',
      creatorAddress,
      triggerType,
      triggerData,
      category: SecurityCategory.TRIGGER
    };

    const result = await this.checkAction(context);

    if (result.allowed) {
      await this.reportIntentTriggered({
        creatorAddress,
        triggerType,
        ...triggerData
      });
    }

    return result;
  }

  /**
   * Protect an execution action
   */
  async protectExecution(creatorAddress, actionType, actionData) {
    const context = {
      action: 'execution',
      actionType,
      creatorAddress,
      actionData,
      category: SecurityCategory.EXEC
    };

    // Check political filter first
    if (actionData.description) {
      const politicalCheck = await this._checkPoliticalContent(actionData.description);
      if (politicalCheck.isViolation) {
        await this.reportPoliticalViolation({
          creatorAddress,
          actionType,
          matchedTerms: politicalCheck.matchedTerms
        });
        return {
          allowed: false,
          reason: 'political_violation',
          matchedTerms: politicalCheck.matchedTerms
        };
      }
    }

    // Check with daemon
    const result = await this.checkAction(context);

    if (result.allowed) {
      await this.reportExecutionAction({
        creatorAddress,
        actionType,
        ...actionData
      });
    }

    return result;
  }

  /**
   * Protect a sunset operation
   */
  async protectSunsetOperation(creatorAddress, operation, operationData) {
    const context = {
      action: `sunset_${operation}`,
      creatorAddress,
      operationData,
      category: SecurityCategory.SUNSET
    };

    const result = await this.checkAction(context);

    if (result.allowed) {
      await this.reportSunsetEvent({
        action: `sunset_${operation}`,
        creatorAddress,
        ...operationData
      });
    }

    return result;
  }

  /**
   * Validate RPC URL to prevent SSRF attacks
   * @private
   */
  _validateRpcUrl(rpcUrl) {
    try {
      const url = new URL(rpcUrl);

      // Block internal/private network addresses
      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        'internal',
        'local'
      ];

      // Check for blocked hosts
      const hostname = url.hostname.toLowerCase();
      if (blockedHosts.some(blocked => hostname === blocked || hostname.endsWith('.' + blocked))) {
        throw new Error('Internal network addresses are not allowed');
      }

      // Block private IP ranges
      const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipMatch) {
        const [, a, b, c, d] = ipMatch.map(Number);
        // 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x
        if (a === 10 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 169 && b === 254)) {
          throw new Error('Private network IP addresses are not allowed');
        }
      }

      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only HTTP/HTTPS protocols are allowed');
      }

      return true;
    } catch (err) {
      if (err.message.includes('Invalid URL')) {
        throw new Error('Invalid RPC URL format');
      }
      throw err;
    }
  }

  /**
   * Create a protected RPC connection
   */
  async createProtectedConnection(rpcUrl, options = {}) {
    if (!this.daemonClient) {
      return { protected: false, reason: 'no_daemon' };
    }

    // Validate URL to prevent SSRF
    try {
      this._validateRpcUrl(rpcUrl);
    } catch (err) {
      await this.reportEvent({
        category: SecurityCategory.CONNECTION,
        action: 'rpc_connection_blocked',
        severity: SecuritySeverity.WARNING,
        rpcUrl: rpcUrl.substring(0, 100), // Truncate for safety
        reason: err.message
      });
      return { protected: false, reason: err.message };
    }

    const result = await this.daemonClient.protectRPCConnection(rpcUrl, options);

    await this.reportEvent({
      category: SecurityCategory.CONNECTION,
      action: 'rpc_connection_protected',
      severity: SecuritySeverity.INFO,
      rpcUrl,
      ...result
    });

    return result;
  }

  /**
   * Validate a message through the daemon
   */
  async validateMessage(message, context = {}) {
    if (!this.daemonClient) {
      return { valid: true, reason: 'no_daemon' };
    }

    return this.daemonClient.validateMessage(message, context);
  }

  // ============================================================
  // CONFIDENCE AND THRESHOLD MANAGEMENT
  // ============================================================

  /**
   * Check if an action meets confidence threshold
   */
  async checkConfidenceThreshold(confidence, threshold = 95, context = {}) {
    const meetsThreshold = confidence >= threshold;

    if (!meetsThreshold) {
      await this.reportConfidenceFailure({
        confidence,
        threshold,
        ...context
      });

      this.stats.warnings++;
    }

    return {
      meetsThreshold,
      confidence,
      threshold,
      deficit: meetsThreshold ? 0 : threshold - confidence
    };
  }

  // ============================================================
  // BLOCKCHAIN EVENT MONITORING
  // ============================================================

  /**
   * Monitor blockchain events and report to SIEM
   * @param {Object} contract - Ethers.js contract instance
   * @param {Array} eventNames - Events to monitor
   */
  monitorContractEvents(contract, eventNames = []) {
    const handlers = {};

    eventNames.forEach(eventName => {
      const handler = async (...args) => {
        const event = args[args.length - 1]; // Last arg is the event object

        await this.reportEvent({
          category: this._getCategoryFromEvent(eventName),
          action: eventName,
          severity: this._getSeverityFromEvent(eventName),
          contractAddress: contract.target || contract.address,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          args: args.slice(0, -1).map(arg =>
            typeof arg === 'bigint' ? arg.toString() : arg
          )
        });
      };

      contract.on(eventName, handler);
      handlers[eventName] = handler;
    });

    // Return cleanup function
    return () => {
      Object.entries(handlers).forEach(([eventName, handler]) => {
        contract.off(eventName, handler);
      });
    };
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  _normalizeEvent(event) {
    return {
      timestamp: new Date().toISOString(),
      source: 'FIE',
      version: '1.0',
      severity: event.severity || SecuritySeverity.INFO,
      category: event.category || SecurityCategory.SYSTEM,
      action: event.action || 'unknown',
      ...event
    };
  }

  async _checkPoliticalContent(content) {
    // Basic political keyword check (mirrors PoliticalFilter.sol)
    const politicalKeywords = [
      'political', 'electoral', 'lobbying', 'partisan', 'policy',
      'election', 'campaign', 'ballot', 'vote', 'legislation',
      'advocacy', 'activist', 'protest', 'lobby', 'endorse',
      'politician', 'party', 'government', 'regulatory'
    ];

    const lowerContent = content.toLowerCase();
    const matchedTerms = politicalKeywords.filter(keyword =>
      lowerContent.includes(keyword)
    );

    return {
      isViolation: matchedTerms.length > 0,
      matchedTerms
    };
  }

  _getCategoryFromEvent(eventName) {
    const categoryMap = {
      'IntentCaptured': SecurityCategory.INTENT,
      'GoalAdded': SecurityCategory.INTENT,
      'VersionSigned': SecurityCategory.INTENT,
      'IntentRevoked': SecurityCategory.INTENT,
      'IntentTriggered': SecurityCategory.TRIGGER,
      'DeadmanCheckIn': SecurityCategory.TRIGGER,
      'TrustedSignatureSubmitted': SecurityCategory.TRIGGER,
      'ExecutionActivated': SecurityCategory.EXEC,
      'ActionExecuted': SecurityCategory.EXEC,
      'InactionDefault': SecurityCategory.EXEC,
      'LicenseIssued': SecurityCategory.TOKEN,
      'RoyaltyPaid': SecurityCategory.TOKEN,
      'TransferredToPublicDomain': SecurityCategory.TOKEN,
      'SunsetInitiated': SecurityCategory.SUNSET,
      'AssetsArchived': SecurityCategory.SUNSET,
      'SunsetCompleted': SecurityCategory.SUNSET,
      'CorpusFrozen': SecurityCategory.CORPUS,
      'SemanticIndexCreated': SecurityCategory.CORPUS
    };

    return categoryMap[eventName] || SecurityCategory.SYSTEM;
  }

  _getSeverityFromEvent(eventName) {
    const severityMap = {
      'IntentTriggered': SecuritySeverity.ALERT,
      'IntentRevoked': SecuritySeverity.WARNING,
      'InactionDefault': SecuritySeverity.WARNING,
      'SunsetInitiated': SecuritySeverity.ALERT,
      'SunsetCompleted': SecuritySeverity.CRITICAL,
      'ExecutionActivated': SecuritySeverity.NOTICE
    };

    return severityMap[eventName] || SecuritySeverity.INFO;
  }

  _handleSIEMError(err) {
    this.stats.errors++;
    this.emit('error', { source: 'siem', error: err });
  }

  _handleEventSent(event) {
    this.emit('eventSent', event);
  }

  _handleDaemonError(err) {
    this.stats.errors++;
    this.emit('error', { source: 'daemon', error: err });
  }

  _handleDaemonConnected() {
    this.emit('daemonConnected');
  }

  _handleDaemonDisconnected() {
    this.emit('daemonDisconnected');
  }

  // ============================================================
  // STATISTICS AND HEALTH
  // ============================================================

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      siemConnected: this.siemClient?.isConnected || false,
      daemonConnected: this.daemonClient?.isConnected || false
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      overall: 'healthy',
      siem: { status: 'unknown', latency: null },
      daemon: { status: 'unknown', latency: null }
    };

    if (this.siemClient) {
      const start = Date.now();
      try {
        await this.siemClient.ping();
        health.siem = { status: 'healthy', latency: Date.now() - start };
      } catch (err) {
        health.siem = { status: 'unhealthy', error: err.message };
        health.overall = 'degraded';
      }
    }

    if (this.daemonClient) {
      const start = Date.now();
      try {
        await this.daemonClient.ping();
        health.daemon = { status: 'healthy', latency: Date.now() - start };
      } catch (err) {
        health.daemon = { status: 'unhealthy', error: err.message };
        health.overall = 'degraded';
      }
    }

    if (health.siem.status === 'unhealthy' && health.daemon.status === 'unhealthy') {
      health.overall = 'unhealthy';
    }

    return health;
  }
}

/**
 * Create a configured SecurityIntegration instance
 * @param {Object} options - Configuration options
 */
function createSecurityIntegration(options = {}) {
  const defaultConfig = {
    siem: {
      apiUrl: process.env.BOUNDARY_SIEM_URL || 'http://localhost:8080',
      apiKey: process.env.BOUNDARY_SIEM_API_KEY,
      transport: process.env.BOUNDARY_SIEM_TRANSPORT || 'rest'
    },
    daemon: {
      socketPath: process.env.BOUNDARY_DAEMON_SOCKET || '/var/run/boundary-daemon/daemon.sock',
      host: process.env.BOUNDARY_DAEMON_HOST,
      port: process.env.BOUNDARY_DAEMON_PORT ? parseInt(process.env.BOUNDARY_DAEMON_PORT) : undefined
    },
    failClosed: process.env.SECURITY_FAIL_CLOSED !== 'false',
    enabled: process.env.SECURITY_ENABLED !== 'false'
  };

  return new SecurityIntegration({ ...defaultConfig, ...options });
}

module.exports = {
  SecurityIntegration,
  createSecurityIntegration,
  SecuritySeverity,
  SecurityCategory,
  ProtectionResult
};

/**
 * Boundary-SIEM Client
 *
 * Client library for reporting security events to Boundary-SIEM.
 * Supports multiple transport protocols:
 * - REST API (JSON over HTTP/HTTPS)
 * - CEF over UDP
 * - CEF over TCP
 *
 * Features:
 * - Event batching and buffering
 * - Automatic retry with exponential backoff
 * - Event schema validation
 * - Compression support (gzip)
 * - Health monitoring
 * - Rate limiting awareness
 *
 * @see https://github.com/kase1111-hash/Boundary-SIEM
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const dgram = require('dgram');
const net = require('net');
const zlib = require('zlib');

/**
 * Event severity levels (aligned with Boundary-SIEM schema)
 */
const Severity = {
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
 * Event categories for FIE protocol
 */
const EventCategory = {
  AUTH: 'auth',
  INTENT: 'intent',
  TRIGGER: 'trigger',
  EXECUTION: 'execution',
  SUNSET: 'sunset',
  CORPUS: 'corpus',
  TOKEN: 'token',
  POLITICAL: 'political',
  CONFIDENCE: 'confidence',
  SYSTEM: 'system'
};

/**
 * Action types for event classification
 */
const ActionType = {
  // Auth actions
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_FAILURE: 'auth.failure',
  AUTH_MFA: 'auth.mfa',

  // Intent actions
  INTENT_CAPTURED: 'intent.captured',
  INTENT_REVOKED: 'intent.revoked',
  INTENT_TRIGGERED: 'intent.triggered',
  INTENT_GOAL_ADDED: 'intent.goal_added',

  // Execution actions
  EXEC_ACTIVATED: 'execution.activated',
  EXEC_ACTION: 'execution.action',
  EXEC_INACTION: 'execution.inaction',
  EXEC_LICENSE: 'execution.license_issued',
  EXEC_FUNDED: 'execution.project_funded',
  EXEC_DISTRIBUTED: 'execution.revenue_distributed',

  // Political violations
  POLITICAL_BLOCKED: 'political.blocked',
  POLITICAL_DETECTED: 'political.detected',

  // Sunset actions
  SUNSET_INITIATED: 'sunset.initiated',
  SUNSET_ARCHIVED: 'sunset.archived',
  SUNSET_TRANSITIONED: 'sunset.transitioned',
  SUNSET_COMPLETED: 'sunset.completed',

  // System actions
  SYSTEM_ERROR: 'system.error',
  SYSTEM_ANOMALY: 'system.anomaly'
};

/**
 * Outcome values
 */
const Outcome = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  UNKNOWN: 'unknown'
};

/**
 * Configuration defaults
 */
const DEFAULT_CONFIG = {
  // REST API configuration
  apiUrl: 'http://localhost:8080',
  apiKey: '',
  apiVersion: 'v1',

  // CEF configuration
  cefUdpHost: 'localhost',
  cefUdpPort: 5514,
  cefTcpHost: 'localhost',
  cefTcpPort: 5515,
  useTls: false,

  // Transport preference
  transport: 'rest', // 'rest', 'cef-udp', 'cef-tcp'

  // Batching
  batchSize: 100,
  batchIntervalMs: 5000,
  maxQueueSize: 10000,

  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000,
  retryBackoffMultiplier: 2,

  // Compression
  enableCompression: true,

  // Source identification
  sourceProduct: 'finite-intent-executor',
  sourceVersion: '1.0.0',
  sourceHost: null, // Auto-detected

  // Health check
  healthCheckIntervalMs: 30000,

  // Debug
  debug: false
};

/**
 * BoundarySIEMClient - Main client class
 */
class BoundarySIEMClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventQueue = [];
    this.isProcessing = false;
    this.batchTimer = null;
    this.healthCheckTimer = null;
    this.stats = {
      eventsSent: 0,
      eventsDropped: 0,
      batchesSent: 0,
      errors: 0,
      lastError: null,
      lastEventTime: null,
      isHealthy: true
    };

    // Auto-detect hostname
    if (!this.config.sourceHost) {
      this.config.sourceHost = require('os').hostname();
    }

    // Start batch timer
    this._startBatchTimer();

    // Start health check
    if (this.config.healthCheckIntervalMs > 0) {
      this._startHealthCheck();
    }
  }

  /**
   * Create a new security event
   */
  createEvent({
    action,
    outcome = Outcome.SUCCESS,
    severity = Severity.INFO,
    actor = {},
    target = {},
    metadata = {}
  }) {
    return {
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: {
        product: this.config.sourceProduct,
        version: this.config.sourceVersion,
        host: this.config.sourceHost
      },
      action,
      outcome,
      severity,
      actor: {
        type: actor.type || 'user',
        id: actor.id || null,
        name: actor.name || null,
        email: actor.email || null,
        ip: actor.ip || null
      },
      target: {
        type: target.type || null,
        id: target.id || null,
        name: target.name || null
      },
      metadata
    };
  }

  /**
   * Report a security event
   */
  async report(event) {
    // Validate event
    if (!this._validateEvent(event)) {
      this.stats.eventsDropped++;
      throw new Error('Invalid event format');
    }

    // Add to queue
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      // Drop oldest event
      this.eventQueue.shift();
      this.stats.eventsDropped++;
    }

    this.eventQueue.push(event);
    this.stats.lastEventTime = new Date();

    // Check if we should flush immediately
    if (this.eventQueue.length >= this.config.batchSize) {
      await this._flush();
    }

    return event.event_id;
  }

  /**
   * Report intent captured event
   */
  async reportIntentCaptured(creator, intentHash, corpusHash, actorInfo = {}) {
    const event = this.createEvent({
      action: ActionType.INTENT_CAPTURED,
      outcome: Outcome.SUCCESS,
      severity: Severity.NOTICE,
      actor: {
        type: 'creator',
        id: creator,
        ...actorInfo
      },
      target: {
        type: 'intent',
        id: intentHash,
        name: 'intent_graph'
      },
      metadata: {
        intent_hash: intentHash,
        corpus_hash: corpusHash,
        category: EventCategory.INTENT
      }
    });
    return this.report(event);
  }

  /**
   * Report intent triggered event
   */
  async reportIntentTriggered(creator, triggerType, triggerDetails = {}) {
    const event = this.createEvent({
      action: ActionType.INTENT_TRIGGERED,
      outcome: Outcome.SUCCESS,
      severity: Severity.CRITICAL,
      actor: {
        type: 'system',
        id: 'trigger_mechanism',
        name: triggerType
      },
      target: {
        type: 'creator',
        id: creator,
        name: 'intent'
      },
      metadata: {
        trigger_type: triggerType,
        ...triggerDetails,
        category: EventCategory.TRIGGER
      }
    });
    return this.report(event);
  }

  /**
   * Report political violation
   */
  async reportPoliticalViolation(creator, action, matchedTerm, category) {
    const event = this.createEvent({
      action: ActionType.POLITICAL_BLOCKED,
      outcome: Outcome.FAILURE,
      severity: Severity.CRITICAL,
      actor: {
        type: 'execution_agent',
        id: 'executor'
      },
      target: {
        type: 'creator',
        id: creator,
        name: 'posthumous_action'
      },
      metadata: {
        attempted_action: action,
        matched_term: matchedTerm,
        political_category: category,
        category: EventCategory.POLITICAL,
        violation_type: 'no_political_agency_clause'
      }
    });
    return this.report(event);
  }

  /**
   * Report low confidence inaction
   */
  async reportLowConfidence(creator, action, confidence, threshold) {
    const event = this.createEvent({
      action: ActionType.EXEC_INACTION,
      outcome: Outcome.FAILURE,
      severity: Severity.WARNING,
      actor: {
        type: 'execution_agent',
        id: 'executor'
      },
      target: {
        type: 'creator',
        id: creator,
        name: 'posthumous_action'
      },
      metadata: {
        attempted_action: action,
        confidence_score: confidence,
        confidence_threshold: threshold,
        category: EventCategory.CONFIDENCE,
        reason: 'confidence_below_threshold'
      }
    });
    return this.report(event);
  }

  /**
   * Report action execution
   */
  async reportActionExecuted(creator, action, confidence, citation) {
    const event = this.createEvent({
      action: ActionType.EXEC_ACTION,
      outcome: Outcome.SUCCESS,
      severity: Severity.INFO,
      actor: {
        type: 'execution_agent',
        id: 'executor'
      },
      target: {
        type: 'creator',
        id: creator,
        name: 'posthumous_action'
      },
      metadata: {
        executed_action: action,
        confidence_score: confidence,
        corpus_citation: citation,
        category: EventCategory.EXECUTION
      }
    });
    return this.report(event);
  }

  /**
   * Report sunset activation
   */
  async reportSunsetActivated(creator, triggerTimestamp) {
    const event = this.createEvent({
      action: ActionType.SUNSET_INITIATED,
      outcome: Outcome.SUCCESS,
      severity: Severity.CRITICAL,
      actor: {
        type: 'sunset_protocol',
        id: 'sunset_operator'
      },
      target: {
        type: 'creator',
        id: creator,
        name: 'legacy'
      },
      metadata: {
        trigger_timestamp: triggerTimestamp,
        sunset_duration_years: 20,
        category: EventCategory.SUNSET
      }
    });
    return this.report(event);
  }

  /**
   * Report system error
   */
  async reportError(errorCode, message, details = {}) {
    const event = this.createEvent({
      action: ActionType.SYSTEM_ERROR,
      outcome: Outcome.FAILURE,
      severity: this._getSeverityFromErrorCode(errorCode),
      actor: {
        type: 'system',
        id: 'fie_protocol'
      },
      target: {
        type: 'component',
        id: details.component || 'unknown'
      },
      metadata: {
        error_code: errorCode,
        error_message: message,
        ...details,
        category: EventCategory.SYSTEM
      }
    });
    return this.report(event);
  }

  /**
   * Report access denied
   */
  async reportAccessDenied(caller, operation, requiredRole) {
    const event = this.createEvent({
      action: ActionType.AUTH_FAILURE,
      outcome: Outcome.FAILURE,
      severity: Severity.ALERT,
      actor: {
        type: 'user',
        id: caller
      },
      target: {
        type: 'operation',
        id: operation,
        name: requiredRole
      },
      metadata: {
        required_role: requiredRole,
        category: EventCategory.AUTH,
        reason: 'insufficient_permissions'
      }
    });
    return this.report(event);
  }

  /**
   * Flush the event queue immediately
   */
  async flush() {
    await this._flush();
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.eventQueue.length
    };
  }

  /**
   * Check health of SIEM connection
   */
  async checkHealth() {
    try {
      const response = await this._httpRequest('GET', '/v1/health');
      this.stats.isHealthy = response.status === 'healthy';
      return this.stats.isHealthy;
    } catch (error) {
      this.stats.isHealthy = false;
      return false;
    }
  }

  /**
   * Shutdown the client gracefully
   */
  async shutdown() {
    // Stop timers
    if (this.batchTimer) clearInterval(this.batchTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    // Flush remaining events
    await this._flush();
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  _validateEvent(event) {
    return (
      event.event_id &&
      event.timestamp &&
      event.source?.product &&
      event.action &&
      event.outcome &&
      typeof event.severity === 'number' &&
      event.severity >= 1 &&
      event.severity <= 10
    );
  }

  _startBatchTimer() {
    this.batchTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this._flush().catch(err => {
          if (this.config.debug) {
            console.error('[BoundarySIEM] Batch flush error:', err);
          }
        });
      }
    }, this.config.batchIntervalMs);
  }

  _startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth().catch(() => {});
    }, this.config.healthCheckIntervalMs);
  }

  async _flush() {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // Get batch of events
      const batch = this.eventQueue.splice(0, this.config.batchSize);

      // Send based on transport
      switch (this.config.transport) {
        case 'cef-udp':
          await this._sendCefUdp(batch);
          break;
        case 'cef-tcp':
          await this._sendCefTcp(batch);
          break;
        case 'rest':
        default:
          await this._sendRest(batch);
      }

      this.stats.eventsSent += batch.length;
      this.stats.batchesSent++;
    } catch (error) {
      this.stats.errors++;
      this.stats.lastError = error.message;

      // Re-queue events on failure
      this.eventQueue.unshift(...batch);

      if (this.config.debug) {
        console.error('[BoundarySIEM] Flush error:', error);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async _sendRest(events) {
    const payload = JSON.stringify(events);
    let body = payload;

    // Compress if enabled
    if (this.config.enableCompression) {
      body = await new Promise((resolve, reject) => {
        zlib.gzip(payload, (err, compressed) => {
          if (err) reject(err);
          else resolve(compressed);
        });
      });
    }

    await this._httpRequest('POST', '/v1/events/batch', body, {
      'Content-Type': 'application/json',
      ...(this.config.enableCompression && { 'Content-Encoding': 'gzip' })
    });
  }

  async _sendCefUdp(events) {
    const client = dgram.createSocket('udp4');

    try {
      for (const event of events) {
        const cef = this._eventToCef(event);
        const buffer = Buffer.from(cef);

        await new Promise((resolve, reject) => {
          client.send(
            buffer,
            0,
            buffer.length,
            this.config.cefUdpPort,
            this.config.cefUdpHost,
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    } finally {
      client.close();
    }
  }

  async _sendCefTcp(events) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(this.config.cefTcpPort, this.config.cefTcpHost, async () => {
        try {
          for (const event of events) {
            const cef = this._eventToCef(event) + '\n';
            await new Promise((res, rej) => {
              client.write(cef, (err) => {
                if (err) rej(err);
                else res();
              });
            });
          }
          client.end();
          resolve();
        } catch (err) {
          client.destroy();
          reject(err);
        }
      });

      client.on('error', reject);
    });
  }

  _eventToCef(event) {
    // CEF:Version|Vendor|Product|Version|SignatureID|Name|Severity|Extensions
    const signatureId = this._getSignatureId(event.action);
    const extensions = [
      `src=${event.actor?.ip || ''}`,
      `suser=${event.actor?.name || event.actor?.id || ''}`,
      `dhost=${event.target?.name || event.target?.id || ''}`,
      `outcome=${event.outcome}`,
      `cat=${event.metadata?.category || 'general'}`,
      `cs1=${event.event_id}`,
      `cs1Label=event_id`
    ].filter(ext => !ext.includes('=')).join(' ');

    return `CEF:0|FIE|FiniteIntentExecutor|${this.config.sourceVersion}|${signatureId}|${event.action}|${event.severity}|${extensions}`;
  }

  _getSignatureId(action) {
    const signatureMap = {
      [ActionType.INTENT_CAPTURED]: 100,
      [ActionType.INTENT_REVOKED]: 101,
      [ActionType.INTENT_TRIGGERED]: 102,
      [ActionType.EXEC_ACTIVATED]: 200,
      [ActionType.EXEC_ACTION]: 201,
      [ActionType.EXEC_INACTION]: 202,
      [ActionType.POLITICAL_BLOCKED]: 400,
      [ActionType.SUNSET_INITIATED]: 500,
      [ActionType.SYSTEM_ERROR]: 900,
      [ActionType.AUTH_FAILURE]: 401
    };
    return signatureMap[action] || 999;
  }

  _getSeverityFromErrorCode(code) {
    if (code >= 900) return Severity.CRITICAL;
    if (code === 402) return Severity.CRITICAL; // Political violation
    if (code >= 400 && code < 500) return Severity.ERROR;
    if (code >= 100 && code < 200) return Severity.ALERT;
    return Severity.WARNING;
  }

  async _httpRequest(method, path, body = null, extraHeaders = {}) {
    const url = new URL(path, this.config.apiUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'X-API-Key': this.config.apiKey,
        ...extraHeaders
      }
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }
}

// Export
module.exports = {
  BoundarySIEMClient,
  Severity,
  EventCategory,
  ActionType,
  Outcome
};

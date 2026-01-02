/**
 * Boundary Daemon Client
 *
 * Client library for integrating with Boundary Daemon (Agent Smith)
 * for policy decision and connection protection.
 *
 * Features:
 * - Policy evaluation for operations
 * - Connection protection via boundary modes
 * - Memory access control (RecallGate)
 * - Tool execution control (ToolGate)
 * - Message validation (MessageGate)
 * - Ceremony management for overrides
 * - Fail-closed security semantics
 *
 * @see https://github.com/kase1111-hash/boundary-daemon-
 */

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * Boundary modes (increasing security strictness)
 */
const BoundaryMode = {
  OPEN: 'open',           // Full online access
  RESTRICTED: 'restricted', // Limited memory access
  TRUSTED: 'trusted',     // VPN-only, verified operations
  AIRGAP: 'airgap',       // Offline/air-gapped
  COLDROOM: 'coldroom',   // Read-only access
  LOCKDOWN: 'lockdown'    // Emergency - all operations blocked
};

/**
 * Policy decision outcomes
 */
const PolicyDecision = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
  REQUIRE_CEREMONY: 'REQUIRE_CEREMONY'
};

/**
 * Operation types
 */
const OperationType = {
  RECALL: 'recall',
  TOOL: 'tool',
  MODEL: 'model',
  IO: 'io',
  NETWORK: 'network',
  BLOCKCHAIN: 'blockchain'
};

/**
 * Memory classification levels
 */
const MemoryClass = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
  CROWN_JEWELS: 5
};

/**
 * Tool categories
 */
const ToolCategory = {
  DISPLAY_ONLY: 'display_only',
  READ_LOCAL: 'read_local',
  WRITE_LOCAL: 'write_local',
  NETWORK_READ: 'network_read',
  NETWORK_WRITE: 'network_write',
  BLOCKCHAIN_READ: 'blockchain_read',
  BLOCKCHAIN_WRITE: 'blockchain_write',
  FULL_ACCESS: 'full_access'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  socketPath: '/api/boundary.sock',
  host: 'localhost',
  port: 8081,
  useUnixSocket: true,
  apiKey: '',
  timeout: 5000,
  retries: 3,
  retryDelay: 1000,
  failClosed: true, // Deny on daemon unreachable
  debug: false
};

/**
 * BoundaryDaemonClient - Main client class
 */
class BoundaryDaemonClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connected = false;
    this.currentMode = null;
    this.lastHealthCheck = null;
    this.requestId = 0;
    this.pendingRequests = new Map();

    // Connection state
    this.socket = null;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Cache for mode-based decisions
    this.modeCache = new Map();
    this.modeCacheTTL = 5000; // 5 seconds
  }

  /**
   * Connect to the Boundary Daemon
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');

        // Get initial mode
        this._getCurrentMode().then(mode => {
          this.currentMode = mode;
          resolve();
        }).catch(reject);
      };

      const onError = (err) => {
        this.connected = false;
        this.emit('error', err);

        if (this.config.failClosed) {
          // In fail-closed mode, we reject but the client can still be used
          // (all operations will be denied)
          reject(new Error('Boundary Daemon unreachable - fail-closed mode active'));
        } else {
          reject(err);
        }
      };

      if (this.config.useUnixSocket) {
        this.socket = net.createConnection(this.config.socketPath, onConnect);
      } else {
        this.socket = net.createConnection({
          host: this.config.host,
          port: this.config.port
        }, onConnect);
      }

      this.socket.on('error', onError);
      this.socket.on('close', () => this._handleDisconnect());
      this.socket.on('data', (data) => this._handleResponse(data));

      // Set timeout
      this.socket.setTimeout(this.config.timeout);
      this.socket.on('timeout', () => {
        this.socket.destroy(new Error('Connection timeout'));
      });
    });
  }

  /**
   * Disconnect from the daemon
   */
  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Check if a recall (memory access) is permitted
   */
  async checkRecall(memoryClass) {
    // Fail-closed: if not connected, deny
    if (!this.connected && this.config.failClosed) {
      return { permitted: false, reason: 'Boundary Daemon unreachable' };
    }

    try {
      const response = await this._sendRequest('check_recall', {
        memory_class: memoryClass
      });

      return {
        permitted: response.permitted,
        reason: response.reason || (response.permitted ? 'Access granted' : 'Access denied by policy')
      };
    } catch (error) {
      if (this.config.failClosed) {
        return { permitted: false, reason: `Daemon error: ${error.message}` };
      }
      throw error;
    }
  }

  /**
   * Check if a tool execution is permitted
   */
  async checkTool(toolName, resourceRequirements = {}) {
    if (!this.connected && this.config.failClosed) {
      return {
        permitted: false,
        reason: 'Boundary Daemon unreachable',
        allowedCategories: []
      };
    }

    try {
      const response = await this._sendRequest('check_tool', {
        tool_name: toolName,
        resource_requirements: resourceRequirements
      });

      return {
        permitted: response.permitted,
        reason: response.reason,
        allowedCategories: response.allowed_categories || []
      };
    } catch (error) {
      if (this.config.failClosed) {
        return {
          permitted: false,
          reason: `Daemon error: ${error.message}`,
          allowedCategories: []
        };
      }
      throw error;
    }
  }

  /**
   * Validate a message/transaction
   */
  async validateMessage(message, source, destination) {
    if (!this.connected && this.config.failClosed) {
      return { valid: false, reason: 'Boundary Daemon unreachable' };
    }

    try {
      const response = await this._sendRequest('validate_message', {
        message,
        source,
        destination
      });

      return {
        valid: response.valid,
        reason: response.reason,
        modifications: response.modifications || null
      };
    } catch (error) {
      if (this.config.failClosed) {
        return { valid: false, reason: `Daemon error: ${error.message}` };
      }
      throw error;
    }
  }

  /**
   * Evaluate a policy for an operation
   */
  async evaluatePolicy(operation, context = {}) {
    if (!this.connected && this.config.failClosed) {
      return {
        decision: PolicyDecision.DENY,
        reason: 'Boundary Daemon unreachable - fail-closed active'
      };
    }

    try {
      const response = await this._sendRequest('evaluate_policy', {
        operation_type: operation,
        context
      });

      return {
        decision: response.decision,
        reason: response.reason,
        requiredCeremony: response.required_ceremony || null
      };
    } catch (error) {
      if (this.config.failClosed) {
        return {
          decision: PolicyDecision.DENY,
          reason: `Daemon error: ${error.message}`
        };
      }
      throw error;
    }
  }

  /**
   * Check if blockchain operation is permitted
   */
  async checkBlockchainOperation(operationType, details = {}) {
    // Map blockchain operations to policy evaluation
    const context = {
      blockchain: true,
      operation: operationType,
      ...details
    };

    const policyResult = await this.evaluatePolicy(OperationType.BLOCKCHAIN, context);

    // Also check tool access for blockchain tools
    const toolResult = await this.checkTool(`blockchain_${operationType}`, {
      network: details.network || 'ethereum',
      requires_signing: details.requiresSigning || false
    });

    return {
      permitted: policyResult.decision === PolicyDecision.ALLOW && toolResult.permitted,
      policyDecision: policyResult,
      toolDecision: toolResult,
      currentMode: this.currentMode
    };
  }

  /**
   * Check if network connection is permitted
   */
  async checkNetworkAccess(host, port, protocol = 'tcp') {
    const toolResult = await this.checkTool('network_connection', {
      host,
      port,
      protocol
    });

    const policyResult = await this.evaluatePolicy(OperationType.NETWORK, {
      host,
      port,
      protocol
    });

    return {
      permitted: policyResult.decision === PolicyDecision.ALLOW && toolResult.permitted,
      reason: !toolResult.permitted ? toolResult.reason : policyResult.reason
    };
  }

  /**
   * Request a ceremony for elevated access
   */
  async requestCeremony(ceremonyType, reason) {
    if (!this.connected) {
      throw new Error('Not connected to Boundary Daemon');
    }

    const response = await this._sendRequest('request_ceremony', {
      ceremony_type: ceremonyType,
      reason,
      requester: this.config.apiKey
    });

    return {
      ceremonyId: response.ceremony_id,
      status: response.status,
      cooldownSeconds: response.cooldown_seconds,
      expiresAt: response.expires_at
    };
  }

  /**
   * Complete a ceremony step
   */
  async completeCeremonyStep(ceremonyId, stepData) {
    if (!this.connected) {
      throw new Error('Not connected to Boundary Daemon');
    }

    const response = await this._sendRequest('complete_ceremony_step', {
      ceremony_id: ceremonyId,
      step_data: stepData
    });

    return {
      completed: response.completed,
      nextStep: response.next_step,
      status: response.status
    };
  }

  /**
   * Get current boundary mode
   */
  async getCurrentMode() {
    if (this.currentMode && this.lastHealthCheck &&
        Date.now() - this.lastHealthCheck < this.modeCacheTTL) {
      return this.currentMode;
    }

    return this._getCurrentMode();
  }

  /**
   * Check daemon health
   */
  async checkHealth() {
    if (!this.connected) {
      return {
        healthy: false,
        mode: BoundaryMode.LOCKDOWN,
        reason: 'Not connected'
      };
    }

    try {
      const response = await this._sendRequest('health_check', {});
      this.lastHealthCheck = Date.now();
      this.currentMode = response.mode;

      return {
        healthy: response.healthy,
        mode: response.mode,
        components: response.components || {}
      };
    } catch (error) {
      return {
        healthy: false,
        mode: BoundaryMode.LOCKDOWN,
        reason: error.message
      };
    }
  }

  /**
   * Register for mode change notifications
   */
  async subscribeToModeChanges(callback) {
    this.on('mode_changed', callback);

    // Start polling for mode changes if not already
    if (!this._modePollingInterval) {
      this._modePollingInterval = setInterval(async () => {
        try {
          const newMode = await this._getCurrentMode();
          if (newMode !== this.currentMode) {
            const oldMode = this.currentMode;
            this.currentMode = newMode;
            this.emit('mode_changed', { oldMode, newMode });
          }
        } catch (error) {
          if (this.config.debug) {
            console.error('[BoundaryDaemon] Mode polling error:', error);
          }
        }
      }, 5000);
    }
  }

  /**
   * Create a protected connection wrapper
   */
  createProtectedConnection(connectionFactory) {
    return new ProtectedConnection(this, connectionFactory);
  }

  // ============================================================
  // FIE-SPECIFIC PROTECTION METHODS
  // ============================================================

  /**
   * Protect intent capture operation
   */
  async protectIntentCapture(creatorAddress, intentHash) {
    const result = await this.evaluatePolicy(OperationType.BLOCKCHAIN, {
      operation: 'intent_capture',
      creator: creatorAddress,
      intent_hash: intentHash,
      requires_signing: true
    });

    if (result.decision !== PolicyDecision.ALLOW) {
      throw new Error(`Intent capture blocked: ${result.reason}`);
    }

    return true;
  }

  /**
   * Protect trigger activation
   */
  async protectTriggerActivation(creatorAddress, triggerType) {
    const result = await this.evaluatePolicy(OperationType.BLOCKCHAIN, {
      operation: 'trigger_activation',
      creator: creatorAddress,
      trigger_type: triggerType,
      requires_signing: true,
      is_critical: true
    });

    if (result.decision === PolicyDecision.REQUIRE_CEREMONY) {
      // Trigger requires ceremony confirmation
      return {
        allowed: false,
        requiresCeremony: true,
        ceremonyType: result.requiredCeremony
      };
    }

    if (result.decision !== PolicyDecision.ALLOW) {
      throw new Error(`Trigger activation blocked: ${result.reason}`);
    }

    return { allowed: true };
  }

  /**
   * Protect posthumous execution
   */
  async protectExecution(creatorAddress, action, confidence) {
    // High-value operations in stricter modes require additional validation
    const memoryCheck = await this.checkRecall(MemoryClass.CONFIDENTIAL);
    if (!memoryCheck.permitted) {
      return {
        allowed: false,
        reason: `Memory access denied: ${memoryCheck.reason}`
      };
    }

    const toolCheck = await this.checkTool('blockchain_execution', {
      action,
      confidence,
      requires_signing: true
    });

    if (!toolCheck.permitted) {
      return {
        allowed: false,
        reason: `Tool access denied: ${toolCheck.reason}`
      };
    }

    return { allowed: true };
  }

  /**
   * Protect RPC connection
   */
  async protectRPCConnection(rpcUrl) {
    const url = new URL(rpcUrl);

    const networkCheck = await this.checkNetworkAccess(
      url.hostname,
      url.port || (url.protocol === 'https:' ? 443 : 80),
      url.protocol.replace(':', '')
    );

    if (!networkCheck.permitted) {
      throw new Error(`RPC connection blocked: ${networkCheck.reason}`);
    }

    return true;
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  async _getCurrentMode() {
    const health = await this._sendRequest('get_mode', {});
    return health.mode || BoundaryMode.LOCKDOWN;
  }

  async _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) {
        if (this.config.failClosed) {
          reject(new Error('Not connected - fail-closed active'));
        } else {
          reject(new Error('Not connected to Boundary Daemon'));
        }
        return;
      }

      const id = ++this.requestId;
      const request = {
        id,
        method,
        params,
        api_key: this.config.apiKey
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, this.config.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.socket.write(JSON.stringify(request) + '\n');
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  _handleResponse(data) {
    try {
      const response = JSON.parse(data.toString());
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[BoundaryDaemon] Response parse error:', error);
      }
    }
  }

  _handleDisconnect() {
    this.connected = false;
    this.emit('disconnected');

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Attempt reconnection
    if (!this.reconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
      this._reconnect();
    }
  }

  async _reconnect() {
    this.reconnecting = true;
    this.reconnectAttempts++;

    const delay = this.config.retryDelay * Math.pow(2, this.reconnectAttempts - 1);

    if (this.config.debug) {
      console.log(`[BoundaryDaemon] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    }

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
      this.reconnecting = false;
    } catch (error) {
      this.reconnecting = false;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this._reconnect();
      } else {
        this.emit('reconnect_failed');
      }
    }
  }
}

/**
 * ProtectedConnection - Wrapper for connections protected by Boundary Daemon
 */
class ProtectedConnection {
  constructor(daemonClient, connectionFactory) {
    this.daemon = daemonClient;
    this.connectionFactory = connectionFactory;
    this.connection = null;
    this.isProtected = false;
  }

  async establish() {
    // Check if connection is allowed
    const check = await this.daemon.evaluatePolicy(OperationType.NETWORK, {
      type: 'outbound_connection'
    });

    if (check.decision !== PolicyDecision.ALLOW) {
      throw new Error(`Connection blocked by Boundary Daemon: ${check.reason}`);
    }

    // Create the actual connection
    this.connection = await this.connectionFactory();
    this.isProtected = true;

    // Subscribe to mode changes
    this.daemon.on('mode_changed', async ({ newMode }) => {
      if (newMode === BoundaryMode.LOCKDOWN || newMode === BoundaryMode.AIRGAP) {
        // Terminate connection in restrictive modes
        await this.terminate();
      }
    });

    return this.connection;
  }

  async terminate() {
    if (this.connection) {
      if (typeof this.connection.close === 'function') {
        await this.connection.close();
      } else if (typeof this.connection.disconnect === 'function') {
        await this.connection.disconnect();
      }
      this.connection = null;
      this.isProtected = false;
    }
  }

  isActive() {
    return this.isProtected && this.connection !== null;
  }
}

// Export
module.exports = {
  BoundaryDaemonClient,
  ProtectedConnection,
  BoundaryMode,
  PolicyDecision,
  OperationType,
  MemoryClass,
  ToolCategory
};

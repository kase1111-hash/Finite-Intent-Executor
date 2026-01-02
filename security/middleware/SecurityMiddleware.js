/**
 * Security Middleware for Finite Intent Executor
 *
 * Express/Connect middleware that integrates with Boundary-SIEM and Boundary-Daemon
 * to provide request-level security enforcement.
 *
 * Features:
 * - Request logging to SIEM
 * - Policy enforcement via Daemon
 * - Rate limiting integration
 * - Security headers
 * - CORS with security constraints
 * - Request validation
 *
 * @author Finite Intent Executor
 * @version 1.0.0
 */

const { createSecurityIntegration, SecuritySeverity, SecurityCategory } = require('../SecurityIntegration');

/**
 * Create security middleware with optional configuration
 * @param {Object} options - Middleware options
 */
function createSecurityMiddleware(options = {}) {
  const config = {
    enabled: process.env.SECURITY_MIDDLEWARE_ENABLED !== 'false',
    logAllRequests: process.env.LOG_ALL_REQUESTS === 'true',
    enforceProtection: process.env.ENFORCE_PROTECTION !== 'false',
    rateLimit: {
      enabled: true,
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100
    },
    sensitiveRoutes: [
      '/api/intent',
      '/api/trigger',
      '/api/execute',
      '/api/sunset'
    ],
    ...options
  };

  // Initialize security integration
  let security = null;
  let rateLimitStore = new Map();

  const initSecurity = async () => {
    if (!config.enabled) return;

    security = createSecurityIntegration({
      siem: config.siem,
      daemon: config.daemon,
      failClosed: config.enforceProtection
    });

    await security.connect().catch(err => {
      console.warn('[SecurityMiddleware] Failed to connect to security services:', err.message);
    });
  };

  // Initialize on first use
  initSecurity();

  /**
   * Main middleware function
   */
  const middleware = async (req, res, next) => {
    if (!config.enabled) {
      return next();
    }

    const startTime = Date.now();
    const requestId = generateRequestId();

    // Attach security context to request
    req.securityContext = {
      requestId,
      startTime,
      protected: false,
      siemReported: false
    };

    try {
      // Check rate limiting
      if (config.rateLimit.enabled) {
        const rateLimitResult = checkRateLimit(req, config.rateLimit);
        if (!rateLimitResult.allowed) {
          await reportSecurityEvent(security, {
            category: SecurityCategory.AUTH,
            action: 'rate_limit_exceeded',
            severity: SecuritySeverity.WARNING,
            ip: getClientIP(req),
            path: req.path,
            requestId
          });

          return res.status(429).json({
            error: 'Too Many Requests',
            retryAfter: rateLimitResult.retryAfter
          });
        }
      }

      // Check if route requires protection
      const isSensitive = config.sensitiveRoutes.some(route =>
        req.path.startsWith(route)
      );

      if (isSensitive && security && config.enforceProtection) {
        const protectionResult = await checkProtection(security, req);

        if (!protectionResult.allowed) {
          await reportSecurityEvent(security, {
            category: SecurityCategory.POLICY,
            action: 'request_denied',
            severity: SecuritySeverity.WARNING,
            ip: getClientIP(req),
            path: req.path,
            method: req.method,
            reason: protectionResult.reason,
            requestId
          });

          return res.status(403).json({
            error: 'Forbidden',
            reason: protectionResult.reason
          });
        }

        req.securityContext.protected = true;
      }

      // Log request start to SIEM
      if (config.logAllRequests || isSensitive) {
        await reportSecurityEvent(security, {
          category: SecurityCategory.SYSTEM,
          action: 'request_start',
          severity: SecuritySeverity.DEBUG,
          ip: getClientIP(req),
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
          requestId
        });
      }

      // Capture response for logging
      const originalSend = res.send;
      res.send = function(body) {
        res.send = originalSend;
        const result = res.send(body);

        // Log response
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 500 ? SecuritySeverity.ERROR :
                         res.statusCode >= 400 ? SecuritySeverity.WARNING :
                         SecuritySeverity.INFO;

        reportSecurityEvent(security, {
          category: SecurityCategory.SYSTEM,
          action: 'request_complete',
          severity: logLevel,
          ip: getClientIP(req),
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          duration,
          requestId
        }).catch(() => {}); // Non-blocking

        return result;
      };

      next();
    } catch (err) {
      await reportSecurityEvent(security, {
        category: SecurityCategory.SYSTEM,
        action: 'middleware_error',
        severity: SecuritySeverity.ERROR,
        ip: getClientIP(req),
        path: req.path,
        error: err.message,
        requestId
      }).catch(() => {});

      // Fail closed or open based on config
      if (config.enforceProtection) {
        return res.status(500).json({ error: 'Security check failed' });
      }
      next();
    }
  };

  /**
   * Rate limit check
   */
  function checkRateLimit(req, config) {
    const key = getClientIP(req);
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now - record.windowStart > config.windowMs) {
      record = { count: 0, windowStart: now };
    }

    record.count++;
    rateLimitStore.set(key, record);

    // Cleanup old records periodically
    if (rateLimitStore.size > 10000) {
      for (const [k, v] of rateLimitStore) {
        if (now - v.windowStart > config.windowMs) {
          rateLimitStore.delete(k);
        }
      }
    }

    if (record.count > config.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.windowStart + config.windowMs - now) / 1000)
      };
    }

    return { allowed: true };
  }

  /**
   * Check protection with daemon
   */
  async function checkProtection(security, req) {
    if (!security) {
      return { allowed: true, reason: 'no_security' };
    }

    const context = {
      ip: getClientIP(req),
      path: req.path,
      method: req.method,
      headers: sanitizeHeaders(req.headers),
      body: req.body
    };

    return security.checkAction({
      action: `http_${req.method.toLowerCase()}_${req.path.replace(/\//g, '_')}`,
      parameters: context
    });
  }

  return middleware;
}

/**
 * Security headers middleware
 */
function securityHeaders(options = {}) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': options.csp || "default-src 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    ...options.additionalHeaders
  };

  return (req, res, next) => {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    next();
  };
}

/**
 * Request validation middleware
 */
function validateRequest(options = {}) {
  const maxBodySize = options.maxBodySize || 1024 * 1024; // 1MB default
  const requiredHeaders = options.requiredHeaders || [];

  return (req, res, next) => {
    // Check content length
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > maxBodySize) {
      return res.status(413).json({ error: 'Payload too large' });
    }

    // Check required headers
    for (const header of requiredHeaders) {
      if (!req.headers[header.toLowerCase()]) {
        return res.status(400).json({ error: `Missing required header: ${header}` });
      }
    }

    // Validate content type for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
        return res.status(415).json({ error: 'Unsupported media type' });
      }
    }

    next();
  };
}

/**
 * CORS middleware with security constraints
 */
function secureCors(options = {}) {
  const allowedOrigins = options.origins || [process.env.FRONTEND_URL || 'http://localhost:3000'];
  const allowedMethods = options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const allowedHeaders = options.headers || ['Content-Type', 'Authorization', 'X-Request-ID'];
  const maxAge = options.maxAge || 86400; // 24 hours

  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', maxAge);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

/**
 * Blockchain transaction protection middleware
 * Validates and protects blockchain-related API calls
 */
function protectBlockchainOperations(options = {}) {
  const security = options.security || createSecurityIntegration();

  return async (req, res, next) => {
    // Only apply to blockchain operation endpoints
    const blockchainRoutes = [
      '/api/intent/capture',
      '/api/intent/trigger',
      '/api/execute/action',
      '/api/execute/license',
      '/api/sunset/initiate',
      '/api/sunset/complete'
    ];

    if (!blockchainRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    try {
      // Validate request has required blockchain data
      if (!req.body) {
        return res.status(400).json({ error: 'Missing request body' });
      }

      const { creatorAddress, signature, data } = req.body;

      if (!creatorAddress || !signature) {
        return res.status(400).json({ error: 'Missing required blockchain fields' });
      }

      // Validate with security daemon
      const action = req.path.split('/').pop();
      const result = await security.checkAction({
        action: `blockchain_${action}`,
        parameters: {
          creatorAddress,
          data,
          ip: getClientIP(req)
        }
      });

      if (!result.allowed) {
        await security.reportEvent({
          category: SecurityCategory.EXEC,
          action: `blockchain_${action}_denied`,
          severity: SecuritySeverity.WARNING,
          creatorAddress,
          reason: result.reason
        });

        return res.status(403).json({
          error: 'Operation blocked by security policy',
          reason: result.reason
        });
      }

      // Attach protection context
      req.blockchainContext = {
        verified: true,
        creatorAddress,
        action
      };

      next();
    } catch (err) {
      console.error('[BlockchainProtection] Error:', err);
      return res.status(500).json({ error: 'Security validation failed' });
    }
  };
}

/**
 * Audit logging middleware
 * Creates detailed audit logs for compliance
 */
function auditLog(options = {}) {
  const security = options.security || createSecurityIntegration();
  const auditRoutes = options.routes || ['/api/'];

  return async (req, res, next) => {
    // Check if route should be audited
    if (!auditRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    const auditEntry = {
      timestamp: new Date().toISOString(),
      requestId: req.securityContext?.requestId || generateRequestId(),
      method: req.method,
      path: req.path,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      userId: req.user?.id || req.body?.creatorAddress || 'anonymous',
      action: getActionFromPath(req.path),
      requestBody: sanitizeBody(req.body)
    };

    // Capture response
    const originalJson = res.json;
    res.json = function(body) {
      auditEntry.statusCode = res.statusCode;
      auditEntry.responseTime = Date.now() - (req.securityContext?.startTime || Date.now());
      auditEntry.success = res.statusCode < 400;

      // Report to SIEM
      security.reportEvent({
        category: SecurityCategory.SYSTEM,
        action: 'audit_log',
        severity: auditEntry.success ? SecuritySeverity.INFO : SecuritySeverity.WARNING,
        ...auditEntry
      }).catch(() => {});

      return originalJson.call(this, body);
    };

    next();
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

function sanitizeHeaders(headers) {
  const sensitive = ['authorization', 'cookie', 'x-api-key'];
  const sanitized = { ...headers };

  sensitive.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

function sanitizeBody(body) {
  if (!body) return null;

  const sensitive = ['password', 'secret', 'privateKey', 'apiKey', 'token'];
  const sanitized = { ...body };

  sensitive.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

function getActionFromPath(path) {
  const parts = path.split('/').filter(Boolean);
  return parts.slice(1).join('_') || 'unknown';
}

async function reportSecurityEvent(security, event) {
  if (!security) return;
  try {
    await security.reportEvent(event);
  } catch (err) {
    console.warn('[SecurityMiddleware] Failed to report event:', err.message);
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createSecurityMiddleware,
  securityHeaders,
  validateRequest,
  secureCors,
  protectBlockchainOperations,
  auditLog
};

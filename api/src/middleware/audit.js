const logger = require('../utils/logger');

// Audit log levels
const AUDIT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Audit categories
const AUDIT_CATEGORIES = {
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  DATA_ACCESS: 'data_access',
  DATA_MODIFICATION: 'data_modification',
  SYSTEM_OPERATION: 'system_operation',
  SECURITY: 'security',
  COMPLIANCE: 'compliance'
};

// Audit middleware
function auditLog(category, action, details = {}) {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log after response is sent
      const auditData = {
        timestamp: new Date().toISOString(),
        category,
        action,
        userId: req.user?.id || 'anonymous',
        userEmail: req.user?.email || 'anonymous',
        userRole: req.user?.role || 'anonymous',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        method: req.method,
        path: req.path,
        query: req.query,
        body: sanitizeBody(req.body),
        statusCode: res.statusCode,
        responseSize: data ? data.length : 0,
        details
      };

      // Determine log level based on status code and category
      let level = AUDIT_LEVELS.INFO;
      if (res.statusCode >= 400) {
        level = AUDIT_LEVELS.WARNING;
      }
      if (res.statusCode >= 500) {
        level = AUDIT_LEVELS.ERROR;
      }
      if (category === AUDIT_CATEGORIES.SECURITY && res.statusCode === 403) {
        level = AUDIT_LEVELS.CRITICAL;
      }

      logger[level]('Audit log', auditData);
      
      originalSend.call(this, data);
    };
    
    next();
  };
}

// Sanitize sensitive data from request body
function sanitizeBody(body) {
  if (!body) return body;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// Specific audit middleware for different operations
const auditMiddleware = {
  // Authentication events
  auth: auditLog(AUDIT_CATEGORIES.AUTHENTICATION, 'user_authentication'),
  login: auditLog(AUDIT_CATEGORIES.AUTHENTICATION, 'user_login'),
  logout: auditLog(AUDIT_CATEGORIES.AUTHENTICATION, 'user_logout'),
  register: auditLog(AUDIT_CATEGORIES.AUTHENTICATION, 'user_registration'),
  
  // Authorization events
  access: auditLog(AUDIT_CATEGORIES.AUTHORIZATION, 'access_attempt'),
  denied: auditLog(AUDIT_CATEGORIES.AUTHORIZATION, 'access_denied'),
  
  // Data access events
  read: auditLog(AUDIT_CATEGORIES.DATA_ACCESS, 'data_read'),
  list: auditLog(AUDIT_CATEGORIES.DATA_ACCESS, 'data_list'),
  
  // Data modification events
  create: auditLog(AUDIT_CATEGORIES.DATA_MODIFICATION, 'data_create'),
  update: auditLog(AUDIT_CATEGORIES.DATA_MODIFICATION, 'data_update'),
  delete: auditLog(AUDIT_CATEGORIES.DATA_MODIFICATION, 'data_delete'),
  
  // System operations
  system: auditLog(AUDIT_CATEGORIES.SYSTEM_OPERATION, 'system_operation'),
  
  // Security events
  security: auditLog(AUDIT_CATEGORIES.SECURITY, 'security_event'),
  
  // Compliance events
  compliance: auditLog(AUDIT_CATEGORIES.COMPLIANCE, 'compliance_event'),
  
  // Custom audit log
  custom: (category, action) => auditLog(category, action)
};

// HIPAA compliance logging
function hipaaLog(phiAccess, patientId = null) {
  return auditLog(AUDIT_CATEGORIES.COMPLIANCE, 'phi_access', {
    phiAccess,
    patientId,
    compliance: 'HIPAA',
    timestamp: new Date().toISOString()
  });
}

// Export audit functions
module.exports = {
  auditMiddleware,
  hipaaLog,
  AUDIT_LEVELS,
  AUDIT_CATEGORIES
}; 
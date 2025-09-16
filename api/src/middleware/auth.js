const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// JWT Secret - in production, use a strong secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'radscheduler-secret-key-change-in-production';

// User roles
const ROLES = {
  ADMIN: 'admin',
  RADIOLOGIST: 'radiologist',
  TECHNOLOGIST: 'technologist',
  SCHEDULER: 'scheduler',
  VIEWER: 'viewer'
};

// Role permissions
const PERMISSIONS = {
  [ROLES.ADMIN]: ['*'], // All permissions
  [ROLES.RADIOLOGIST]: ['read:appointments', 'write:appointments', 'read:analytics', 'read:clinical'],
  [ROLES.TECHNOLOGIST]: ['read:appointments', 'write:appointments', 'read:analytics'],
  [ROLES.SCHEDULER]: ['read:appointments', 'write:appointments', 'read:analytics', 'write:clinical'],
  [ROLES.VIEWER]: ['read:appointments', 'read:analytics']
};

// Generate JWT token
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  };
  
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: '24h',
    issuer: 'radscheduler',
    audience: 'radscheduler-users'
  });
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'radscheduler',
      audience: 'radscheduler-users'
    });
  } catch (error) {
    logger.warn('JWT verification failed:', error.message);
    return null;
  }
}

// Authentication middleware
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid token.'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token.'
      });
    }
    
    // Add user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name
    };
    
    logger.info('User authenticated', {
      userId: decoded.userId,
      role: decoded.role,
      endpoint: req.path
    });
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

// Role-based authorization middleware
function authorize(requiredPermissions = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const userRole = req.user.role;
    const userPermissions = PERMISSIONS[userRole] || [];
    
    // Check if user has required permissions
    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes('*') || userPermissions.includes(permission)
    );
    
    if (!hasPermission) {
      logger.warn('Access denied', {
        userId: req.user.id,
        role: req.user.role,
        requiredPermissions,
        endpoint: req.path
      });
      
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    
    next();
  };
}

// Optional authentication (for endpoints that work with or without auth)
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          name: decoded.name
        };
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  generateToken,
  verifyToken,
  ROLES,
  PERMISSIONS
}; 
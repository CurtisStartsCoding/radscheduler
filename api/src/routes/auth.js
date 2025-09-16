const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken, authenticate, authorize, ROLES } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid(...Object.values(ROLES)).default(ROLES.VIEWER)
});

// Mock user database (in production, use real database)
const users = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@radscheduler.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: ROLES.ADMIN
  },
  {
    id: '2',
    name: 'Dr. Smith',
    email: 'radiologist@radscheduler.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: ROLES.RADIOLOGIST
  },
  {
    id: '3',
    name: 'Tech Johnson',
    email: 'technologist@radscheduler.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: ROLES.TECHNOLOGIST
  },
  {
    id: '4',
    name: 'Scheduler User',
    email: 'scheduler@radscheduler.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: ROLES.SCHEDULER
  },
  {
    id: '5',
    name: 'Viewer User',
    email: 'viewer@radscheduler.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: ROLES.VIEWER
  }
];

// Login endpoint
router.post('/login', async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });
  
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Generate token
    const token = generateToken(user);
    
    logger.info('User logged in', {
      userId: user.id,
      email: user.email,
      role: user.role
    });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Register endpoint (admin only)
router.post('/register', authenticate, authorize(['*']), async (req, res) => {
  const { error } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });
  
  try {
    const { name, email, password, role } = req.body;
    
    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create new user
    const newUser = {
      id: (users.length + 1).toString(),
      name,
      email,
      password: hashedPassword,
      role: role || ROLES.VIEWER
    };
    
    users.push(newUser);
    
    logger.info('User registered', {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      registeredBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
    
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Get current user profile
router.get('/profile', authenticate, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Logout endpoint (client-side token removal)
router.post('/logout', authenticate, (req, res) => {
  logger.info('User logged out', {
    userId: req.user.id,
    email: req.user.email
  });
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Refresh token endpoint
router.post('/refresh', authenticate, (req, res) => {
  try {
    // Generate new token
    const token = generateToken(req.user);
    
    logger.info('Token refreshed', {
      userId: req.user.id,
      email: req.user.email
    });
    
    res.json({
      success: true,
      token
    });
    
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

// Get all users (admin only)
router.get('/users', authenticate, authorize(['*']), (req, res) => {
  const userList = users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  }));
  
  res.json({
    success: true,
    users: userList
  });
});

module.exports = router; 
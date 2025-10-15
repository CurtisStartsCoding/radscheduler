const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createServer } = require('http');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDB } = require('./db/connection');
const logger = require('./utils/logger');
const { startCleanupJob } = require('./services/session-cleanup');

// Route imports
const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const patientSchedulingRoutes = require('./routes/patient-scheduling');
const smsWebhookRoutes = require('./routes/sms-webhook');
const orderWebhookRoutes = require('./routes/order-webhook');

const app = express();
const httpServer = createServer(app);

// Trust proxy - required when behind nginx reverse proxy
// This allows rate limiter to see real client IPs from X-Forwarded-For header
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3002'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting - configured for 2000 requests/hour capacity
// Webhooks are exempt (have their own auth: Bearer token + Twilio signature)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 1000, // 500 req/15min = 2000/hour
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Exempt health checks and webhook endpoints
    // Webhooks have their own security (Bearer token, Twilio signature)
    return req.path === '/health' ||
           req.path === '/api/sms/webhook' ||
           req.path === '/api/orders/webhook';
  }
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected'
    }
  });
});

// Required environment variable check
const requiredEnv = [
  'DATABASE_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER'
];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/patient', patientSchedulingRoutes);
app.use('/api/sms', smsWebhookRoutes);
app.use('/api/orders', orderWebhookRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize services
let cleanupJobId = null;

async function startServer() {
  try {
    // Connect to database
    await connectDB();

    // Start session cleanup job
    cleanupJobId = startCleanupJob();

    // Start server
    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
      logger.info(`RadScheduler API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`SMS scheduling system active`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down gracefully...');

  // Stop cleanup job
  if (cleanupJobId) {
    const { stopCleanupJob } = require('./services/session-cleanup');
    stopCleanupJob(cleanupJobId);
  }

  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

// Start the server
startServer();
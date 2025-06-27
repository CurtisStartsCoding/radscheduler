const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDB } = require('./db/connection');
const { connectRedis } = require('./services/redis');
const { setupWebSocket } = require('./services/websocket');
const logger = require('./utils/logger');

// Route imports
const hl7Routes = require('./routes/hl7');
const appointmentRoutes = require('./routes/appointments');
const analyticsRoutes = require('./routes/analytics');
const demoRoutes = require('./routes/demo');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      redis: 'connected',
      websocket: 'active'
    }
  });
});

// Required environment variable check
const requiredEnv = [
  'DATABASE_URL', 'REDIS_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER', 'ANTHROPIC_API_KEY'
];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
});

// Routes
app.use('/api/hl7', hl7Routes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/analytics', analyticsRoutes);

// Only mount demo endpoints in non-production
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/demo', demoRoutes);
  // Optionally, only allow /api/hl7/simulate in non-production
  // app.use('/api/hl7/simulate', hl7Routes); // If simulate is a separate route
}

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize services
async function startServer() {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();
    
    // Setup WebSocket
    setupWebSocket(io);
    
    // Start server
    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
      logger.info(`RadScheduler API running on port ${PORT}`);
      logger.info(`WebSocket server active`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
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
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

// Start the server
startServer();
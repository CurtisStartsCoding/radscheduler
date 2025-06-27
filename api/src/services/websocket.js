const logger = require('../utils/logger');

let io = null;
const connectedClients = new Map();

function setupWebSocket(socketIo) {
  io = socketIo;
  
  io.on('connection', (socket) => {
    logger.info('New WebSocket connection', { id: socket.id });
    connectedClients.set(socket.id, {
      connectedAt: new Date(),
      clientInfo: socket.handshake.headers['user-agent']
    });
    
    // Send initial stats
    socket.emit('connected', {
      message: 'Connected to RadScheduler Real-time System',
      serverTime: new Date().toISOString(),
      activeClients: connectedClients.size
    });
    
    // Join demo room for targeted events
    socket.on('join_demo', () => {
      socket.join('demo_room');
      logger.info('Client joined demo room', { id: socket.id });
    });
    
    // Handle demo triggers from admin panel
    socket.on('trigger_scenario', (scenario) => {
      if (scenario === 'dramatic_save') {
        triggerDramaticSave();
      } else if (scenario === 'efficiency_boost') {
        triggerEfficiencyBoost();
      }
    });
    
    // Heartbeat for connection monitoring
    const heartbeatInterval = setInterval(() => {
      socket.emit('heartbeat', {
        timestamp: new Date().toISOString(),
        stats: getCurrentStats()
      });
    }, 5000);
    
    socket.on('disconnect', () => {
      logger.info('WebSocket disconnected', { id: socket.id });
      connectedClients.delete(socket.id);
      clearInterval(heartbeatInterval);
    });
  });
  
  // Periodic stats broadcast
  setInterval(() => {
    broadcastStats();
  }, 3000);
}

function broadcastEvent(eventType, data) {
  if (!io) return;
  
  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    data
  };
  
  io.emit('event', event);
  logger.debug('Broadcast event', { type: eventType });
}

function broadcastStats() {
  if (!io) return;
  
  const stats = getCurrentStats();
  io.emit('stats', stats);
}

function getCurrentStats() {
  return {
    appointments: {
      today: Math.floor(Math.random() * 50) + 150,
      pending: Math.floor(Math.random() * 10) + 5,
      completed: Math.floor(Math.random() * 100) + 400
    },
    efficiency: {
      utilizationRate: 87 + Math.random() * 10,
      averageWaitTime: 12 + Math.floor(Math.random() * 5),
      patientSatisfaction: 94 + Math.random() * 5
    },
    system: {
      messagesProcessed: Math.floor(Math.random() * 1000) + 9000,
      uptime: '99.97%',
      activeConnections: connectedClients.size
    }
  };
}

// Demo scenario triggers
function triggerDramaticSave() {
  const events = [
    {
      delay: 0,
      event: 'hl7_received',
      data: {
        messageType: 'SIU^S12',
        preview: 'MSH|^~\\&|RIS|MEMORIAL|RADSCHED|...'
      }
    },
    {
      delay: 1000,
      event: 'processing_appointment',
      data: {
        patientName: 'John Doe',
        modality: 'MRI',
        studyType: 'Brain with Contrast'
      }
    },
    {
      delay: 2500,
      event: 'critical_conflict_detected',
      data: {
        conflicts: [{
          type: 'CONTRAST_ALLERGY',
          description: 'Patient has severe gadolinium allergy on record',
          recommendation: 'Use non-contrast protocol or consider CT'
        }],
        severity: 'critical'
      }
    },
    {
      delay: 4000,
      event: 'ai_suggestion',
      data: {
        suggestion: 'Switching to T2-weighted non-contrast protocol',
        confidence: 98.5
      }
    },
    {
      delay: 5000,
      event: 'appointment_updated',
      data: {
        status: 'CONFIRMED',
        modifications: ['Protocol changed to non-contrast'],
        safetyScore: 100
      }
    },
    {
      delay: 5500,
      event: 'notification_sent',
      data: {
        type: 'SMS',
        message: 'Appointment confirmed with safety modifications'
      }
    }
  ];
  
  // Execute events with delays
  events.forEach(({ delay, event, data }) => {
    setTimeout(() => {
      broadcastEvent(event, data);
    }, delay);
  });
}

function triggerEfficiencyBoost() {
  broadcastEvent('optimization_started', {
    modality: 'MRI',
    date: new Date().toISOString().split('T')[0]
  });
  
  setTimeout(() => {
    broadcastEvent('optimization_complete', {
      before: {
        utilizationRate: 65,
        averageWaitTime: 47,
        openSlots: 12
      },
      after: {
        utilizationRate: 92,
        averageWaitTime: 12,
        openSlots: 3
      },
      improvement: {
        efficiency: '+47%',
        revenue: '+$12,500/day',
        patientSatisfaction: '+22 points'
      }
    });
  }, 3000);
}

module.exports = {
  setupWebSocket,
  broadcastEvent,
  broadcastStats
};
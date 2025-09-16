const axios = require('axios');
const logger = require('../utils/logger');
const { query } = require('../db/connection');

/**
 * CDS HL7 Connector Service
 * Handles integration between CDS platform and multiple RIS systems
 */
class CDSHL7Connector {
  constructor() {
    this.connections = new Map();
    this.messageQueue = [];
    this.isProcessing = false;
  }

  /**
   * Initialize the connector with client configurations
   */
  async initialize() {
    try {
      // Load RIS client configurations
      const clients = await this.loadClientConfigurations();
      
      // Initialize connections
      for (const [clientId, config] of Object.entries(clients)) {
        await this.initializeConnection(clientId, config);
      }
      
      logger.info('CDS HL7 Connector initialized', { 
        clientCount: clients.length 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize CDS HL7 Connector:', error);
      throw error;
    }
  }

  /**
   * Load RIS client configurations from database
   */
  async loadClientConfigurations() {
    try {
      const result = await query(`
        SELECT id, name, connection_config, hl7_config, features
        FROM ris_clients 
        WHERE active = true
      `);
      
      const clients = {};
      for (const row of result.rows) {
        clients[row.id] = {
          name: row.name,
          connection: JSON.parse(row.connection_config),
          hl7: JSON.parse(row.hl7_config),
          features: JSON.parse(row.features || '{}')
        };
      }
      
      return clients;
    } catch (error) {
      logger.error('Failed to load client configurations:', error);
      throw error;
    }
  }

  /**
   * Initialize connection for a specific RIS client
   */
  async initializeConnection(clientId, config) {
    try {
      const connection = {
        id: clientId,
        config: config,
        status: 'initializing',
        lastHeartbeat: null
      };

      // Test connection
      const isConnected = await this.testConnection(config.connection);
      connection.status = isConnected ? 'connected' : 'failed';
      connection.lastHeartbeat = new Date();

      this.connections.set(clientId, connection);
      
      logger.info('RIS connection initialized', { 
        clientId, 
        status: connection.status 
      });
      
      return connection;
    } catch (error) {
      logger.error('Failed to initialize connection:', { clientId, error });
      throw error;
    }
  }

  /**
   * Test connection to RIS system
   */
  async testConnection(connectionConfig) {
    try {
      if (connectionConfig.type === 'http') {
        // Test HTTP endpoint
        const response = await axios.get(`${connectionConfig.endpoint}/health`, {
          timeout: 5000
        });
        return response.status === 200;
      } else if (connectionConfig.type === 'mllp') {
        // Test MLLP connection (simplified for now)
        // In production, use proper MLLP library
        return true; // Placeholder
      }
      
      return false;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Send clinical decision to RIS system
   */
  async sendClinicalDecision(clientId, clinicalData) {
    try {
      const connection = this.connections.get(clientId);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`No active connection for client: ${clientId}`);
      }

      // Build HL7 message
      const hl7Message = this.buildClinicalDecisionMessage(clinicalData, connection.config.hl7);
      
      // Queue message for reliable delivery
      await this.queueMessage(clientId, 'ORM^O01', hl7Message, clinicalData);
      
      // Send immediately
      const result = await this.sendMessage(clientId, hl7Message);
      
      logger.info('Clinical decision sent to RIS', {
        clientId,
        messageId: result.messageId,
        patientId: clinicalData.patientId
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send clinical decision:', { clientId, error });
      throw error;
    }
  }

  /**
   * Send document to RIS system
   */
  async sendDocument(clientId, documentData) {
    try {
      const connection = this.connections.get(clientId);
      if (!connection || connection.status !== 'connected') {
        throw new Error(`No active connection for client: ${clientId}`);
      }

      // Build HL7 message
      const hl7Message = this.buildDocumentMessage(documentData, connection.config.hl7);
      
      // Queue message for reliable delivery
      await this.queueMessage(clientId, 'MDM^T02', hl7Message, documentData);
      
      // Send immediately
      const result = await this.sendMessage(clientId, hl7Message);
      
      logger.info('Document sent to RIS', {
        clientId,
        messageId: result.messageId,
        documentType: documentData.documentType
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to send document:', { clientId, error });
      throw error;
    }
  }

  /**
   * Build ORM^O01 message for clinical decisions
   */
  buildClinicalDecisionMessage(clinicalData, hl7Config) {
    const timestamp = this.getTimestamp();
    const messageId = this.generateMessageId();
    
    const segments = [
      // MSH - Message Header
      `MSH|^~\\&|${hl7Config.sendingApp}|${hl7Config.sendingFacility}|${hl7Config.receivingApp}|${hl7Config.receivingFacility}|${timestamp}||ORM^O01|${messageId}|P|${hl7Config.version}`,
      
      // PID - Patient Identification
      `PID|1||${clinicalData.patientId}^^^${hl7Config.sendingFacility}||${clinicalData.patientName}||${clinicalData.patientDob}|${clinicalData.patientGender}`,
      
      // PV1 - Patient Visit
      `PV1|1|O|${clinicalData.visitLocation}^^^${hl7Config.sendingFacility}||||${clinicalData.referringPhysician}`,
      
      // ORC - Common Order
      `ORC|NW|${clinicalData.orderId}|||||^^^${timestamp}||${timestamp}|||${clinicalData.referringPhysician}`,
      
      // OBR - Observation Request
      `OBR|1|${clinicalData.orderId}||${clinicalData.procedureCode}^${clinicalData.procedureDescription}^CPT4||||||||||||${clinicalData.referringPhysician}`,
      
      // NTE - Notes and Comments (Clinical Context)
      `NTE|1||CDS Risk Score: ${clinicalData.riskScore}% - ${clinicalData.recommendations.join(', ')}`
    ];

    // Add clinical summary document if available
    if (clinicalData.clinicalSummary) {
      segments.push(`OBX|1|ED|PDF^CLINICAL_SUMMARY^L|1|^APPLICATION^PDF^Base64^${clinicalData.clinicalSummary}||||||F`);
    }

    return segments.join('\r');
  }

  /**
   * Build MDM^T02 message for documents
   */
  buildDocumentMessage(documentData, hl7Config) {
    const timestamp = this.getTimestamp();
    const messageId = this.generateMessageId();
    
    const segments = [
      // MSH - Message Header
      `MSH|^~\\&|${hl7Config.sendingApp}|${hl7Config.sendingFacility}|${hl7Config.receivingApp}|${hl7Config.receivingFacility}|${timestamp}||MDM^T02|${messageId}|P|${hl7Config.version}`,
      
      // PID - Patient Identification
      `PID|1||${documentData.patientId}^^^${hl7Config.sendingFacility}||${documentData.patientName}||${documentData.patientDob}|${documentData.patientGender}`,
      
      // PV1 - Patient Visit
      `PV1|1|O|${documentData.visitLocation}^^^${hl7Config.sendingFacility}`,
      
      // TXA - Transcription Document Header
      `TXA|1|CN|${documentData.documentType}|${timestamp}|${documentData.referringPhysician}|||||||${documentData.orderId}||AU||LA`,
      
      // OBX - Observation/Result (Document Content)
      `OBX|1|ED|${documentData.documentType}^${documentData.documentDescription}^L|1|^APPLICATION^PDF^Base64^${documentData.content}||||||F`
    ];

    return segments.join('\r');
  }

  /**
   * Send HL7 message to RIS system
   */
  async sendMessage(clientId, message) {
    try {
      const connection = this.connections.get(clientId);
      const config = connection.config.connection;
      
      let response;
      if (config.type === 'http') {
        response = await axios.post(config.endpoint, message, {
          headers: { 'Content-Type': 'text/plain' },
          timeout: 10000
        });
      } else if (config.type === 'mllp') {
        // Use MLLP library for TCP connections
        response = await this.sendMLLPMessage(config.host, config.port, message);
      }
      
      // Log transaction
      await this.logTransaction(clientId, 'sent', message, response);
      
      return {
        success: true,
        messageId: this.extractMessageId(message),
        response: response
      };
    } catch (error) {
      // Log failed transaction
      await this.logTransaction(clientId, 'failed', message, error);
      throw error;
    }
  }

  /**
   * Send MLLP message (placeholder - implement with proper MLLP library)
   */
  async sendMLLPMessage(host, port, message) {
    // TODO: Implement with node-hl7-client or similar
    // For now, return success
    return { status: 'ack' };
  }

  /**
   * Queue message for reliable delivery
   */
  async queueMessage(clientId, messageType, message, data) {
    try {
      await query(`
        INSERT INTO hl7_transactions 
        (id, client_id, message_type, message_content, data, sent_at, status)
        VALUES ($1, $2, $3, $4, $5, NOW(), 'queued')
      `, [
        this.generateUUID(),
        clientId,
        messageType,
        message,
        JSON.stringify(data)
      ]);
    } catch (error) {
      logger.error('Failed to queue message:', error);
      throw error;
    }
  }

  /**
   * Log transaction to database
   */
  async logTransaction(clientId, status, message, response) {
    try {
      await query(`
        INSERT INTO hl7_transactions 
        (id, client_id, message_type, message_content, sent_at, status, response)
        VALUES ($1, $2, $3, $4, NOW(), $5, $6)
      `, [
        this.generateUUID(),
        clientId,
        this.extractMessageType(message),
        message,
        status,
        JSON.stringify(response)
      ]);
    } catch (error) {
      logger.error('Failed to log transaction:', error);
    }
  }

  /**
   * Utility methods
   */
  getTimestamp() {
    return new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  }

  generateMessageId() {
    return `MSG${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  extractMessageType(message) {
    const msh = message.split('\r')[0];
    const fields = msh.split('|');
    return fields[8] || 'UNKNOWN';
  }

  extractMessageId(message) {
    const msh = message.split('\r')[0];
    const fields = msh.split('|');
    return fields[9] || 'UNKNOWN';
  }

  /**
   * Get connection status for all clients
   */
  getConnectionStatus() {
    const status = {};
    for (const [clientId, connection] of this.connections) {
      status[clientId] = {
        name: connection.config.name,
        status: connection.status,
        lastHeartbeat: connection.lastHeartbeat
      };
    }
    return status;
  }
}

module.exports = new CDSHL7Connector(); 
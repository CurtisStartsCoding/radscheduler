# Simple HL7 Integration Specification
*For Imaging Order Validation Platform*

## Overview
This spec provides a minimal, scalable approach to connect your platform with multiple RIS systems using HL7 v2.x messaging. Build once, configure per client.

## Core Messages You Need

### 1. Order Message (ORM^O01)
Send validated imaging orders to RIS.

```
MSH|^~\&|YOURPLATFORM|FACILITY|RIS|RAD|20240118120000||ORM^O01|MSG00001|P|2.5.1
PID|1||MRN123^^^FACILITY||DOE^JOHN^A||19800101|M
PV1|1|O|CLINIC^^^FACILITY||||REFMD123^SMITH^ROBERT^MD
ORC|NW|ORD123456|||||^^^20240118||20240118120000|||REFMD123^SMITH^ROBERT^MD
OBR|1|ORD123456||71020^CHEST XRAY 2 VIEWS^CPT4||||||||||||REFMD123^SMITH^ROBERT^MD
NTE|1||Clinical indication: Persistent cough x 2 weeks
OBX|1|ED|PDF^DOCUMENT^L|1|^APPLICATION^PDF^Base64^[ENCODED_PDF_DATA]||||||F
```

### 2. Document Notification (MDM^T02)
Notify RIS when referring physician uploads a document.

```
MSH|^~\&|YOURPLATFORM|FACILITY|RIS|RAD|20240118120500||MDM^T02|MSG00002|P|2.5.1
PID|1||MRN123^^^FACILITY||DOE^JOHN^A||19800101|M
PV1|1|O|CLINIC^^^FACILITY
TXA|1|CN|TX|20240118120500|REFMD123^SMITH^ROBERT^MD|||||||ORD123456||AU||LA
OBX|1|ED|PDF^INSURANCE_AUTH^L|1|^APPLICATION^PDF^Base64^[ENCODED_PDF_DATA]||||||F
```

## Implementation Components

### 1. Message Builder Service
```javascript
// Simple Node.js example
class HL7Builder {
  constructor(config) {
    this.sendingApp = config.sendingApp || 'YOURPLATFORM';
    this.sendingFacility = config.facility;
    this.version = config.version || '2.5.1';
  }

  buildORM(order) {
    const timestamp = this.getTimestamp();
    const messageId = this.generateMessageId();
    
    return [
      this.buildMSH('ORM^O01', messageId, timestamp),
      this.buildPID(order.patient),
      this.buildPV1(order.visit),
      this.buildORC(order),
      this.buildOBR(order),
      order.notes ? `NTE|1||${order.notes}` : null,
      order.validatedPDF ? this.buildOBX(order.validatedPDF) : null
    ].filter(Boolean).join('\r');
  }

  buildMDM(document) {
    const timestamp = this.getTimestamp();
    const messageId = this.generateMessageId();
    
    return [
      this.buildMSH('MDM^T02', messageId, timestamp),
      this.buildPID(document.patient),
      this.buildPV1(document.visit),
      this.buildTXA(document),
      this.buildOBX(document.content)
    ].join('\r');
  }
}
```

### 2. Connection Manager
```javascript
// Simple connection pool for multiple RIS endpoints
class RISConnectionManager {
  constructor() {
    this.connections = new Map();
  }

  async sendMessage(clientId, message) {
    const config = await this.getClientConfig(clientId);
    const connection = this.getConnection(config);
    
    try {
      const response = await connection.send(message);
      await this.logTransaction(clientId, message, response);
      return response;
    } catch (error) {
      await this.handleError(clientId, error, message);
      throw error;
    }
  }

  getConnection(config) {
    // Use existing MLLP library or HTTP endpoint
    if (config.type === 'mllp') {
      return new MLLPConnection(config.host, config.port);
    } else {
      return new HTTPConnection(config.endpoint);
    }
  }
}
```

### 3. Client Configuration
```json
{
  "radiology_clients": {
    "regional_radiology": {
      "name": "Regional Radiology Group",
      "connection": {
        "type": "mllp",
        "host": "10.0.0.100",
        "port": 6661
      },
      "hl7": {
        "version": "2.5.1",
        "receivingApp": "REGIONALRIS",
        "receivingFacility": "REGIONAL"
      },
      "features": {
        "acceptsPDF": true,
        "documentTypes": ["PDF", "DOC", "JPG"]
      }
    }
  }
}
```

## API Integration Layer

### Webhook Handler
```javascript
// Your existing API receives events
app.post('/webhook/document-uploaded', async (req, res) => {
  const { orderId, documentType, documentUrl, patientId } = req.body;
  
  // Fetch document and order details
  const order = await getOrder(orderId);
  const document = await getDocument(documentUrl);
  
  // Build and send HL7 message
  const mdmMessage = hl7Builder.buildMDM({
    patient: order.patient,
    visit: order.visit,
    orderId: orderId,
    documentType: documentType,
    content: document.base64
  });
  
  // Send to RIS
  await risManager.sendMessage(order.radiologyGroupId, mdmMessage);
  
  res.json({ status: 'sent' });
});
```

## Database Schema (Simple)

### Integration Status Table
```sql
CREATE TABLE hl7_transactions (
  id UUID PRIMARY KEY,
  client_id VARCHAR(50),
  message_type VARCHAR(10),
  message_content TEXT,
  sent_at TIMESTAMP,
  acknowledged BOOLEAN,
  ack_message TEXT,
  retry_count INT DEFAULT 0,
  status VARCHAR(20) -- 'sent', 'acknowledged', 'failed', 'retry'
);
```

### Client Configuration Table
```sql
CREATE TABLE ris_clients (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200),
  connection_config JSONB,
  hl7_config JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP
);
```

## Deployment Architecture

```
Your Platform
     |
     v
Message Queue (Redis/RabbitMQ)
     |
     v
HL7 Service (1 instance can handle all clients)
     |
     v
Connection Pool → Multiple RIS Systems
```

## Required Libraries

### Node.js
```json
{
  "dependencies": {
    "node-hl7-client": "^1.0.0",  // For MLLP connections
    "simple-hl7": "^3.0.0",        // For message parsing
    "bull": "^4.0.0",              // For message queue
    "winston": "^3.0.0"            // For logging
  }
}
```

### Python
```python
# requirements.txt
hl7==0.4.0      # Message parsing
aiohl7==0.1.0   # Async MLLP client
redis==4.0.0    # Message queue
```

## Integration Checklist Per Client

1. **Collect from client:**
   - [ ] RIS IP address and port
   - [ ] Receiving application/facility codes
   - [ ] Sample HL7 message they accept
   - [ ] Firewall whitelist request

2. **Configure in your system:**
   - [ ] Add client to configuration
   - [ ] Test connection
   - [ ] Send test message
   - [ ] Verify acknowledgment

3. **Go-live:**
   - [ ] Send first real order
   - [ ] Monitor logs
   - [ ] Document any field mappings

## Common Field Mappings

Most RIS systems expect these standard fields:
- Patient ID → PID-3
- Order Number → ORC-2, OBR-2
- Procedure Code → OBR-4
- Ordering Provider → ORC-12, OBR-16
- Document Type → OBX-3
- Document Content → OBX-5

## Error Handling

```javascript
// Simple retry logic
async function sendWithRetry(message, clientId, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await risManager.sendMessage(clientId, message);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

## Monitoring

Track these metrics per client:
- Messages sent/hour
- Success rate
- Average response time
- Failed message count

## Testing

### Test Message Generator
```javascript
// Generate test messages for client validation
function generateTestORM(clientConfig) {
  return hl7Builder.buildORM({
    patient: { id: 'TEST123', name: 'TEST^PATIENT' },
    visit: { type: 'O', location: 'CLINIC' },
    orderId: 'TESTORD001',
    procedure: { code: '71020', description: 'CHEST XRAY' },
    provider: { id: 'TESTMD', name: 'TEST^DOCTOR^MD' }
  });
}
```

## Support Scripts

### Connection Tester
```bash
#!/bin/bash
# test_hl7_connection.sh
echo -e "MSH|^~\&|TEST|TEST|RIS|RAD|$(date +%Y%m%d%H%M%S)||QRY^A19|TEST001|P|2.5.1\r" | \
  nc $1 $2
```

### Quick Setup Script
```javascript
// setup_new_client.js
async function setupNewClient(clientInfo) {
  // 1. Add to database
  await db.addClient(clientInfo);
  
  // 2. Test connection
  const testResult = await testConnection(clientInfo);
  
  // 3. Send test message
  if (testResult.success) {
    await sendTestMessage(clientInfo);
  }
  
  return { clientId: clientInfo.id, status: 'ready' };
}
```

## Total Development Estimate

- **Week 1**: Build message builder and basic sender
- **Week 2**: Add connection manager and error handling
- **Week 3**: Create configuration system and monitoring
- **Week 4**: Testing with 2-3 pilot radiology groups

**Ongoing per client**: 2-4 hours configuration and testing

---

*This specification prioritizes simplicity and reliability over complex features. Start with this foundation and add capabilities only as real clients request them.*
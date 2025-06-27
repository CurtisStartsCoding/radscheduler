# RadScheduler Integration Guide

## Overview

This guide explains how to integrate RadScheduler with existing hospital systems, including RIS (Radiology Information Systems), PACS, and other healthcare applications.

## Integration Architecture

```
[Hospital Systems] → [Mirth Connect] → [RadScheduler API] → [Database + Notifications]
     ↓                    ↓                    ↓                    ↓
   RIS/PACS           HL7 Processing      Business Logic      PostgreSQL + SMS
   EMR/CPOE          Message Routing      AI Analysis        Redis + WebSocket
   Scheduling        Data Transformation  Conflict Detection  Real-time Updates
```

## Integration Methods

### 1. HL7 Message Integration (Recommended)

**Best for:** Existing systems that already send HL7 messages

#### Setup Steps:

1. **Configure Mirth Connect Channel**
   ```xml
   <!-- RIS_Integration.xml -->
   <channel>
     <name>RIS_Integration</name>
     <sourceConnector>
       <transportName>TCP Listener</transportName>
       <port>8661</port>
     </sourceConnector>
     <destinationConnectors>
       <connector>
         <transportName>HTTP Sender</transportName>
         <host>your-radscheduler-host</host>
         <port>3001</port>
         <method>POST</method>
         <url>/api/hl7/appointment</url>
       </connector>
     </destinationConnectors>
   </channel>
   ```

2. **Configure Your Hospital System**
   - Point your RIS/EMR to send HL7 SIU^S12 messages to Mirth Connect
   - Default port: `8661` (TCP)
   - Message format: HL7 v2.5 SIU (Scheduling Information Unsolicited)

3. **Message Flow**
   ```
   RIS → HL7 SIU^S12 → Mirth Connect → JSON Transform → RadScheduler API
   ```

### 2. Direct API Integration

**Best for:** Modern systems with REST API capabilities

#### Endpoints Available:

```bash
# Create appointment
POST /api/hl7/simulate
Content-Type: application/json

{
  "patientId": "MRN123456",
  "patientName": "John Doe",
  "patientPhone": "+1234567890",
  "modality": "MRI",
  "studyType": "Brain w/o contrast",
  "datetime": "2024-01-15T10:00:00Z",
  "referringPhysician": "Dr. Smith",
  "urgency": "routine"
}

# Get appointments
GET /api/appointments?date=2024-01-15&modality=MRI

# Get analytics
GET /api/analytics/dashboard
```

### 3. Database Integration

**Best for:** Systems that can directly access the database

#### Database Schema:
```sql
-- Main appointments table
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(50) NOT NULL,
  patient_name VARCHAR(200) NOT NULL,
  patient_phone VARCHAR(20),
  modality VARCHAR(50) NOT NULL,
  study_type VARCHAR(200),
  datetime TIMESTAMP NOT NULL,
  duration INTEGER DEFAULT 30,
  status VARCHAR(50) DEFAULT 'SCHEDULED',
  referring_physician VARCHAR(200),
  urgency VARCHAR(50) DEFAULT 'routine',
  notes TEXT,
  conflicts JSONB,
  source VARCHAR(50) DEFAULT 'HL7',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Supported HL7 Message Types

### SIU^S12 - New Appointment
```
MSH|^~\&|RIS|MEMORIAL|RADSCHED|RAD|20240115100000||SIU^S12|MSG001|P|2.5
SCH||1234|||||||30|MIN|^^30^202401151000^^R||||||||||||||SCHEDULED
PID|1||MRN123456||DOE^JOHN||19800101|M|||123 MAIN ST^^BOSTON^MA^02101||617-555-0123
RGS|1|A
AIS|1|A|MRI001^MRI BRAIN W/O CONTRAST|202401151000
AIP|1|A|RADIOLOGIST^DOE^JOHN^MD|202401151000
```

### SIU^S13 - Appointment Modification
### SIU^S14 - Appointment Cancellation
### SIU^S15 - Appointment Discontinuation

## Configuration Requirements

### 1. Network Configuration

```bash
# Required ports
8661 - HL7 TCP Listener (Mirth Connect)
3001 - RadScheduler API
5432 - PostgreSQL Database
6379 - Redis Cache
8443 - Mirth Connect Admin UI
```

### 2. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Redis
REDIS_URL=redis://host:port

# External APIs
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
ANTHROPIC_API_KEY=your_anthropic_key

# Security
JWT_SECRET=your_jwt_secret
NODE_ENV=production
```

### 3. Security Requirements

- **TLS/SSL**: All external connections must use HTTPS/TLS
- **Authentication**: API keys or JWT tokens for API access
- **Network Security**: Firewall rules to restrict access
- **Data Encryption**: Database encryption at rest
- **Audit Logging**: All data access logged

## Integration Testing

### 1. Test HL7 Message Flow

```bash
# Using the Python simulator
cd simulator
python send-hl7.py

# Or using curl
curl -X POST http://localhost:3001/api/hl7/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "patientName": "Test Patient",
    "modality": "MRI",
    "datetime": "2024-01-15T10:00:00Z"
  }'
```

### 2. Verify Data Flow

1. **Check Mirth Connect Dashboard**: Verify message received
2. **Check RadScheduler Logs**: Verify processing
3. **Check Database**: Verify appointment created
4. **Check SMS**: Verify notification sent
5. **Check WebSocket**: Verify real-time updates

### 3. Load Testing

```bash
# Run load test
cd api
npm run test:load

# Or use the simulator
python send-hl7.py load-test
```

## Production Deployment

### 1. Infrastructure Setup

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  radscheduler-api:
    image: radscheduler/api:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres
      - redis

  mirth:
    image: nextgenhealthcare/connect:latest
    ports:
      - "8661:8661"
      - "8443:8443"
    volumes:
      - ./mirth/channels:/opt/connect/channels
```

### 2. Monitoring & Alerting

- **Health Checks**: `/health` endpoint
- **Metrics**: Prometheus/Grafana integration
- **Logs**: Centralized logging (ELK stack)
- **Alerts**: Failed HL7 messages, API errors

### 3. Backup & Recovery

- **Database**: Automated backups
- **Configuration**: Version-controlled configs
- **Disaster Recovery**: Multi-region deployment

## Troubleshooting

### Common Issues

1. **HL7 Messages Not Received**
   - Check Mirth Connect channel status
   - Verify network connectivity
   - Check firewall rules

2. **API Errors**
   - Check environment variables
   - Verify database connectivity
   - Check API logs

3. **SMS Notifications Not Sent**
   - Verify Twilio credentials
   - Check phone number format
   - Verify SMS service status

### Debug Commands

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f radscheduler-api

# Test database connection
psql $DATABASE_URL -c "SELECT NOW();"

# Test Redis connection
redis-cli ping

# Check Mirth Connect
curl http://localhost:8443/api/system/info
```

## Support & Documentation

- **API Documentation**: Available at `/api/docs` (when implemented)
- **Logs**: Check application logs for detailed error information
- **Monitoring**: Use Mirth Connect dashboard for HL7 message monitoring
- **Contact**: For integration support, contact the development team

## Compliance Considerations

### HIPAA Compliance
- All data encrypted in transit and at rest
- Audit logging enabled
- Access controls implemented
- Business Associate Agreements (BAAs) required with vendors

### SOC 2 Compliance
- Security controls implemented
- Regular security assessments
- Incident response procedures
- Change management processes

## Next Steps

1. **Pilot Phase**: Start with one modality (e.g., MRI)
2. **Validation**: Test with real hospital data
3. **Expansion**: Add additional modalities and features
4. **Optimization**: Tune performance based on usage patterns 
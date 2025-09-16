# Modular Scheduling System

RadScheduler provides a **dual scheduling system** that can be configured to work with any RIS (Radiology Information System) while allowing patients to self-schedule when appropriate.

## 🎯 Overview

The system supports two scheduling workflows:

1. **RIS Integration**: Pull appointments from your existing RIS (Avreo, Epic, Cerner, etc.)
2. **Patient Self-Scheduling**: Allow patients to book appointments directly through RadScheduler

Both workflows are **modular and configurable** - you can enable/disable features based on your RIS type and hospital policies.

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENABLE_PATIENT_SCHEDULING` | Enable patient self-scheduling globally | `false` | `true` |
| `RIS_TYPE` | Type of RIS system | `avreo` | `epic`, `cerner`, `custom` |
| `ALLOWED_MODALITIES` | Modalities patients can self-schedule | `X-Ray,Ultrasound` | `X-Ray,Ultrasound,Mammography` |
| `RESTRICTED_MODALITIES` | Modalities requiring approval | `MRI,CT` | `MRI,CT,Angiography` |

### RIS-Specific Configurations

#### Avreo RIS (Recommended)
```bash
export ENABLE_PATIENT_SCHEDULING=true
export RIS_TYPE=avreo
```
- ✅ Self-scheduling enabled for: X-Ray, Ultrasound, Mammography
- ⚠️ Requires approval for: MRI, CT
- 🔄 Syncs every 5 minutes

#### Epic RIS
```bash
export ENABLE_PATIENT_SCHEDULING=true
export RIS_TYPE=epic
```
- ❌ Self-scheduling disabled (Epic handles scheduling)
- 🔄 Syncs appointments from Epic every 10 minutes
- ⚠️ All modalities require approval

#### Cerner RIS
```bash
export ENABLE_PATIENT_SCHEDULING=true
export RIS_TYPE=cerner
```
- ❌ Self-scheduling disabled (Cerner handles scheduling)
- 🔄 Syncs appointments from Cerner every 15 minutes
- ⚠️ All modalities require approval

#### Custom RIS
```bash
export ENABLE_PATIENT_SCHEDULING=true
export RIS_TYPE=custom
export CUSTOM_SELF_SCHEDULING=true
export CUSTOM_ALLOWED_MODALITIES=X-Ray,Ultrasound
export CUSTOM_REQUIRES_APPROVAL=MRI,CT
export CUSTOM_SYNC_ENABLED=true
export CUSTOM_SYNC_INTERVAL=5
```

## 🚀 Quick Start

### 1. Enable Patient Self-Scheduling

```bash
# For Avreo RIS
export ENABLE_PATIENT_SCHEDULING=true
export RIS_TYPE=avreo

# Restart the API server
npm run dev
```

### 2. Access Patient Scheduling

- **Web Interface**: `http://localhost:3000/patient-schedule`
- **API Endpoints**: 
  - `GET /api/patient/available-slots`
  - `POST /api/patient/book-appointment`
  - `GET /api/patient/my-appointments`
  - `POST /api/patient/cancel-appointment`

### 3. Configure Avreo Integration

```bash
export AVREO_API_URL=https://your-avreo-instance.com/api
export AVREO_USERNAME=your_username
export AVREO_PASSWORD=your_password
```

## 🔄 Dual Scheduling Workflow

### 1. RIS Integration
- Pulls appointments from your RIS calendar API
- Syncs every 5-15 minutes (configurable)
- Maintains appointment history and status
- Handles cancellations and updates

### 2. Patient Self-Scheduling
- Patients book appointments through web interface
- Real-time availability checking
- Conflict detection with existing appointments
- Automatic SMS confirmations
- Approval workflow for complex procedures

### 3. Unified Management
- All appointments in one system
- AI-powered conflict detection
- SMS notifications for all appointments
- Complete audit trail
- Role-based access control

## 📊 Benefits

### For Hospitals
- **Reduce Phone Calls**: Patients can self-schedule 24/7
- **Improve Efficiency**: Automated scheduling and notifications
- **Maintain Control**: Approval workflow for complex procedures
- **Seamless Integration**: Works with existing RIS systems
- **HIPAA Compliant**: Full audit trail and security

### For Patients
- **24/7 Booking**: Schedule appointments anytime
- **Real-time Availability**: See available slots instantly
- **Instant Confirmation**: SMS notifications
- **Easy Management**: View and cancel appointments online
- **No Phone Calls**: Self-service reduces wait times

## 🔒 Security & Compliance

### HIPAA Compliance
- All patient data encrypted in transit and at rest
- Complete audit trail for all actions
- Role-based access control
- Secure API authentication

### Approval Workflow
- Complex procedures (MRI, CT) require staff approval
- Pending appointments clearly marked
- Staff can approve/reject with comments
- Automatic notifications to patients

### Data Protection
- Patient data never stored in plain text
- Secure API endpoints with authentication
- Regular security audits
- Compliance with healthcare regulations

## 🛠️ API Endpoints

### Patient Self-Scheduling
```javascript
// Get available slots
GET /api/patient/available-slots?date=2024-01-15&modality=X-Ray

// Book appointment
POST /api/patient/book-appointment
{
  "patientName": "John Doe",
  "patientPhone": "+1234567890",
  "modality": "X-Ray",
  "studyType": "Chest",
  "preferredDate": "2024-01-15",
  "preferredTime": "09:00"
}

// Get patient appointments
GET /api/patient/my-appointments?phone=+1234567890

// Cancel appointment
POST /api/patient/cancel-appointment
{
  "appointmentId": "123",
  "patientPhone": "+1234567890"
}
```

### Avreo Integration
```javascript
// Check integration status
GET /api/avreo/status

// Manual sync
POST /api/avreo/sync

// Test connection
GET /api/avreo/test-connection

// Get configuration
GET /api/avreo/config
```

## 🎛️ Advanced Configuration

### Business Hours
```bash
export BUSINESS_HOURS_START=8
export BUSINESS_HOURS_END=18
```

### Booking Limits
```bash
export MAX_ADVANCE_BOOKING_DAYS=30
export MIN_ADVANCE_BOOKING_HOURS=24
```

### SMS Configuration
```bash
export TWILIO_ACCOUNT_SID=your_sid
export TWILIO_AUTH_TOKEN=your_token
export TWILIO_PHONE_NUMBER=+1234567890
```

## 🚀 Deployment

### Production Setup
1. Set environment variables for your RIS type
2. Configure database and Redis connections
3. Set up SMS provider (Twilio recommended)
4. Configure SSL certificates
5. Set up monitoring and logging

### Docker Deployment
```bash
# Build and run with environment variables
docker-compose up -d

# Or set environment variables in docker-compose.yml
environment:
  - ENABLE_PATIENT_SCHEDULING=true
  - RIS_TYPE=avreo
  - AVREO_API_URL=https://your-avreo-instance.com/api
```

## 📞 Support

For configuration help or custom RIS integration:
- Check the configuration examples above
- Review the API documentation
- Test with the provided test scripts
- Contact support for custom integrations

## 🔄 Migration Guide

### From Manual Scheduling
1. Enable patient self-scheduling
2. Configure allowed modalities
3. Train staff on approval workflow
4. Monitor and adjust as needed

### From Another System
1. Configure RIS integration
2. Import existing appointments
3. Enable self-scheduling gradually
4. Train patients on new system

The modular design ensures a smooth transition regardless of your current setup! 
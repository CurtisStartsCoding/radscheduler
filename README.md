# RadScheduler

AI-Powered Radiology Scheduling System with HL7 Integration

## 🚀 Status: **FULLY OPERATIONAL**

RadScheduler is a comprehensive hospital radiology scheduling system that integrates with existing hospital systems via HL7, uses AI for intelligent conflict detection, and provides real-time SMS notifications to patients.

## ✅ Core Features

- **HL7 Integration** - Process SIU/ORM messages from hospital systems
- **AI-Powered Scheduling** - Claude API detects conflicts and optimizes schedules
- **Real-time SMS** - Instant patient notifications via Twilio
- **WebSocket Dashboard** - Live appointment updates and analytics
- **Production Ready** - Docker, AWS deployment, HIPAA compliance

## 🚀 Quick Start

```bash
# Start all services
docker-compose up -d

# Test the system
curl http://localhost:3001/health

# Test HL7 simulation (sends SMS)
curl -X POST http://localhost:3001/api/hl7/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "P123456789",
    "patientName": "John Doe",
    "patientPhone": "+1234567890",
    "modality": "MRI",
    "studyType": "Brain w/o contrast",
    "datetime": "2024-01-15T10:00:00Z"
  }'
```

## 📚 Documentation

All comprehensive documentation has been moved to the `docs/` folder:

- **[📖 Main Documentation](docs/README.md)** - Complete setup and usage guide
- **[🎯 Implementation Plan](docs/implementation-plan.md)** - Development roadmap and status
- **[🚀 MVP Implementation](docs/mvp-implementation-plan.md)** - MVP features and completion status
- **[🏗️ Production Implementation](docs/production-implementation-plan.md)** - Production deployment guide
- **[☁️ AWS Deployment](docs/aws-deployment-guide.md)** - Complete AWS setup instructions
- **[✅ Production Checklist](docs/production-checklist.md)** - Deployment checklist
- **[📋 Product Requirements](docs/prd.md)** - Product requirements document
- **[🤖 Claude Integration](docs/claude.md)** - AI integration details

## 🏥 Current Status

**All core features are working end-to-end:**

- ✅ HL7 message processing and appointment creation
- ✅ AI-powered conflict detection via Claude API
- ✅ Real-time SMS notifications via Twilio
- ✅ WebSocket-powered live dashboard
- ✅ Production-ready Docker deployment
- ✅ AWS deployment configuration
- ✅ HIPAA-compliant security measures

## 🔧 Technology Stack

- **Backend**: Node.js, Express.js, PostgreSQL, Redis
- **AI**: Anthropic Claude API
- **SMS**: Twilio
- **Real-time**: Socket.io
- **Deployment**: Docker, AWS ECS, Nginx
- **Integration**: HL7, Mirth Connect

## 📞 Support

For questions, support, or collaboration:
- Check the [documentation](docs/README.md)
- Review the [implementation plans](docs/implementation-plan.md)
- Contact: [your-email@domain.com]

---

**RadScheduler** - Revolutionizing hospital radiology scheduling with AI-powered intelligence and real-time communication.
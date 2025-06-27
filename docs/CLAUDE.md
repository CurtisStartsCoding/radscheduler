# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
RadScheduler is a hackathon project that integrates hospital RIS systems with intelligent scheduling via HL7 messaging. Built to win against OpenAI/Gemini teams.

## Key Commands

### Development
```bash
# Start all services (Mirth, Postgres, Redis)
docker-compose up -d

# Seed demo data
npm run seed-demo

# Start API server
cd api && npm run dev

# Start web UI
cd web && npm run dev

# Run HL7 simulator
python simulator/send-hl7.py
```

### Testing & Demo
```bash
# Trigger demo scenarios
npm run demo:dramatic-save
npm run demo:efficiency-boost

# Load test
npm run load-test

# Reset for clean demo
npm run reset-demo
```

## Architecture

### Core Flow
1. HL7 messages → Mirth Connect (Docker)
2. Mirth transforms → JSON → Node.js API
3. API processes → PostgreSQL + Redis events
4. Real-time updates → WebSocket → React UI
5. Notifications → Twilio SMS

### Key Services
- **Mirth Connect**: HL7 processing engine (port 8661)
- **API**: Node.js/Express (port 3001)
- **Web**: Next.js/React (port 3000)
- **PostgreSQL**: Main database (port 5432)
- **Redis**: Event streaming (port 6379)

### AI Integration
- Claude API for conflict detection and schedule optimization
- Fallback to rule-based system if API fails

## Demo Scenarios

### Dramatic Save
Trigger: Send HL7 for patient "John Doe" with MRI order
Result: System detects contrast allergy, suggests alternative

### Efficiency Boost
Trigger: Click "Optimize Schedule" in UI
Result: Shows 47% reduction in wait times

## Critical Files
- `/api/services/ai-scheduler.js` - AI integration
- `/api/services/hl7-processor.js` - Message handling
- `/web/components/LiveDashboard.tsx` - Real-time UI
- `/mirth/channels/RIS_Integration.xml` - Mirth config

## Hackathon Tips
1. Always have demo data ready
2. Test SMS with real phone numbers before demo
3. Use keyboard shortcuts for scenario triggers
4. Have offline fallbacks for everything
5. Keep Mirth logs open to show real HL7 processing
Product Requirements Document (PRD) for RadScheduler Upgrades
Product Overview
RadScheduler is an AI-powered radiology scheduling system integrated with hospital RIS/PACS via HL7. Upgrades transform it into a full-suite platform enabling quick patient booking online or via phone with an AI assistant, maintaining radiology focus (e.g., imaging appointments like MRI/CT). Key goals: Enhance efficiency, reduce no-shows, ensure HIPAA compliance via AWS services. Target: Radiology departments in hospitals/clinics handling 100-500 daily appointments.
Target Users

Patients: Self-schedule online or call AI for bookings, confirmations, prep instructions (e.g., fasting for scans).
Radiologists/Staff: Monitor dashboards, override AI suggestions, receive real-time updates.
Admins: Configure rules, view analytics (e.g., utilization rates for scanners).

Key Features
Core Scheduling

AI-optimized booking: Use Claude for conflict detection (e.g., patient history, equipment availability) and slot suggestions.
Multi-RIS support: Extend HL7 for Avreo/Epic integration.

Online Booking

Patient portal enhancements: Visual calendar, real-time availability, FAQ chat via Claude.

Phone AI Assistant

Voice-based booking: Handle inbound calls for scheduling, rescheduling, reminders.
Integration: AWS Transcribe Medical for real-time STT (medical terminology accuracy), Comprehend Medical for entity extraction (e.g., parse "MRI knee" as procedure/PHI), Lex for conversational flow.
Fallback: Escalate to human if complex (e.g., urgent cases).

Notifications & Reminders

Expand Twilio SMS to include voice calls; AI-personalized prep (e.g., "Arrive 30min early for contrast").

Analytics & Reporting

Dashboard upgrades: Predictive no-show forecasts, equipment utilization stats.

Compliance & Security

HIPAA: Encrypt PHI, audit logs, BAAs with AWS/Anthropic/Twilio. No data storage without consent.

Functional Requirements

User Flows:

Patient calls: Greet, STT input → Comprehend extract (procedure, time) → Claude schedule → TTS confirm/SMS.
Online: Chat/widget for guided booking.


Integrations: AWS SDK in Node.js for Transcribe/Comprehend; real-time Socket.io for updates.
Edge Cases: Handle accents (Transcribe adapts), conflicts (AI flags), cancellations (update RIS).

Non-Functional Requirements

Performance: <2s response for voice/text; scale to 1k concurrent users.
Reliability: 99.9% uptime; graceful degradation (rule-based fallback).
Security: JWT for auth; PHI redaction in logs; regular audits.
Accessibility: WCAG 2.1 for frontend; voice for low-vision users.

User Stories

As a patient, I can call to book an X-ray and get instant confirmation.
As staff, I see AI-flagged conflicts (e.g., overlapping scanner use) on dashboard.
As admin, I configure AI rules (e.g., block bookings during maintenance).

Success Metrics

30% reduction in no-shows via AI reminders.
50% of bookings via self-service (online/phone).
Compliance: Zero breaches in audits; user satisfaction >4.5/5.

Implementation Plan
Phases & Timeline (Assuming 2-3 Devs, 1-2 Weeks Total)
Phase 1: Planning & Setup (Days 1-2)

Review base code; sign AWS BAA, configure HIPAA account.
Define schemas: Add voice_log table for audits.
Tools: Install AWS SDK via npm (existing Node.js).

Phase 2: Phone AI Development (Days 3-6)

Integrate Twilio Voice for calls → Stream to Transcribe Medical (real-time STT).
Process transcripts: Comprehend Medical extracts entities (e.g., ICD codes for radiology procedures).
AI Logic: Feed to Claude for scheduling; TTS via Amazon Polly.
Code Structure: New service (api/src/services/voice-assistant.js); endpoint (/api/voice/handle).
Testing: Simulate calls with synthetic data; ensure PHI encryption.

Phase 3: Online Enhancements (Days 7-8)

Add chat widget (React component) integrated with Claude.
Update patient portal: FullCalendar for slots; real-time via Redis pub/sub.

Phase 4: Compliance & Testing (Days 9-10)

Implement redaction: Comprehend for PHI masking in logs.
Tests: Expand simulators for voice scenarios; HIPAA checklist (e.g., access controls).
Integration: HL7 broadcasts for voice bookings.

Phase 5: Deployment & Monitoring (Days 11-12)

Docker updates: Add AWS services to compose.
Deploy to ECS; monitor with CloudWatch.
Rollout: Beta to one radiology site.

Resources

Tech: AWS (Transcribe/Comprehend/Lex), existing stack.
Team: Backend dev for integrations; frontend for UI; legal for HIPAA review.
Budget: AWS costs (~$0.02/min Transcribe); no new licenses.

Risks & Mitigations

Compliance Delays: Pre-engage legal; use AWS HIPAA guides.
Integration Issues: Fallback to Twilio STT if Transcribe latency high.
Accuracy: Train on radiology datasets; monitor error rates <5%.
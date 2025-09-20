# Voice AI Booking System

**COMPLETELY SEPARATE FROM RADSCHEDULER**

This is an independent voice booking system that communicates with RadScheduler ONLY via API endpoints.

## System Architecture

```
Patient Phone Call
      ↓
AWS Connect (voice-ai-booking instance)
      ↓
Amazon Lex Bot
      ↓
Lambda Functions (isolated)
      ↓
API Call → RadScheduler /api/voice/* endpoints
      ↓
Booking Confirmation
```

## Key Principles

1. **Zero Shared Infrastructure** - No shared databases, queues, or services
2. **API-Only Communication** - Only talks to RadScheduler via REST API
3. **Independent Failure** - Voice system down doesn't affect web booking
4. **Separate Monitoring** - Own dashboards and metrics
5. **Isolated Compliance** - Own audit logs and retention policies

## Directory Structure

```
voice-ai-booking/
├── aws-connect/          # Connect flows and configuration
├── lambdas/             # Voice-specific Lambda functions
├── infrastructure/      # CloudFormation/Terraform templates
├── monitoring/          # Dashboards and alerts
└── docs/               # Voice system documentation
```

## Quick Start

1. Deploy AWS infrastructure: `cd infrastructure && ./deploy.sh`
2. Configure organization mappings
3. Test with single organization
4. Scale to all organizations

## Independence from RadScheduler

- **No shared code** - Completely separate codebase
- **No shared database** - Uses DynamoDB for voice logs
- **No shared dependencies** - Own package.json
- **No shared deployment** - Separate CI/CD pipeline

## Contact

Voice AI Team: voice-team@radscheduler.com
(Separate from main RadScheduler team)
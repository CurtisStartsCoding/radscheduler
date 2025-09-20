# AWS Connect Voice AI Setup Guide

## Overview
This guide details the implementation of AI-powered voice booking for RadScheduler using AWS Connect, Amazon Lex, and supporting AWS services. The system enables patients to call and book appointments through natural conversation with an AI assistant.

## Architecture

```
Patient Phone Call
        ↓
    AWS Connect
        ↓
  Contact Flow
        ↓
   Amazon Lex Bot
        ↓
  Lambda Functions ← → RadScheduler API
        ↓
   Confirmation
   (SMS + Voice)
```

## Why AWS Connect vs Custom Solution

### AWS Connect Advantages:
- **3-5 days deployment** vs 2+ weeks custom build
- **Built-in HIPAA compliance** with BAA coverage
- **$0.018/minute** all-inclusive pricing
- **Auto-scaling** from 1 to 10,000+ concurrent calls
- **Integrated analytics** and call recording
- **Native Lex integration** for conversational AI

### Custom Build Challenges:
- Complex pipeline: Twilio → Transcribe → Lex → Comprehend → Polly
- Manual handling of disconnects, retries, failover
- More components to secure and audit
- Higher maintenance overhead

## Implementation Components

### 1. AWS Connect Instance Setup

```bash
# Create Connect instance via AWS CLI
aws connect create-instance \
  --identity-management-type CONNECT_MANAGED \
  --instance-alias radscheduler-prod \
  --inbound-calls-enabled \
  --outbound-calls-enabled
```

### 2. Contact Flow Structure

**File**: `aws-connect/contact-flows/appointment-booking-flow.json`

Key flow steps:
1. Greeting with voice prompt
2. Invoke Lex bot for conversation
3. Process booking intent
4. Send SMS confirmation
5. Handle agent transfer if needed

### 3. Amazon Lex Bot Configuration

**File**: `aws-connect/lex-bot/radscheduler-bot-definition.json`

**Intents**:
- `BookAppointment` - Schedule new appointments
- `CheckAvailability` - Query open slots
- `RescheduleAppointment` - Move existing bookings
- `CancelAppointment` - Cancel bookings
- `TransferToAgent` - Human escalation

**Slot Types**:
- `RadiologyProcedure` - MRI, CT, X-ray, etc.
- Built-in: Date, Time, PhoneNumber

### 4. Lambda Functions

#### Check Availability Lambda
**File**: `aws-connect/lambdas/check-availability/index.js`

- Queries RadScheduler API for open slots
- Uses Comprehend Medical for entity extraction
- Returns voice-optimized responses

#### Book Appointment Lambda
```javascript
// Core booking logic
async function bookAppointment(orgId, appointmentData) {
    // 1. Validate with RadScheduler API
    // 2. Use Claude for conflict detection
    // 3. Create appointment
    // 4. Send confirmation
    // 5. Log for HIPAA audit
}
```

### 5. HIPAA Compliance Features

- **Encryption**: All calls encrypted in transit and at rest
- **Audit Logging**: Every interaction logged to CloudWatch
- **PHI Redaction**: Comprehend Medical removes PHI from logs
- **Access Control**: IAM policies restrict data access
- **BAA Coverage**: Included in AWS BAA

## Setup Instructions

### Prerequisites
- AWS Account with HIPAA BAA signed
- RadScheduler API deployed
- Phone number for testing

### Step 1: Deploy Connect Instance

```bash
# 1. Create instance
aws connect create-instance \
  --instance-alias radscheduler-prod \
  --identity-management-type CONNECT_MANAGED

# 2. Claim phone number
aws connect claim-phone-number \
  --target-arn arn:aws:connect:us-east-1:ACCOUNT:instance/INSTANCE_ID \
  --phone-number "+1234567890"

# 3. Import contact flow
aws connect create-contact-flow \
  --instance-id INSTANCE_ID \
  --name "Appointment Booking" \
  --content file://appointment-booking-flow.json
```

### Step 2: Create Lex Bot

```bash
# 1. Create bot
aws lexv2-models create-bot \
  --bot-name RadSchedulerBot \
  --role-arn arn:aws:iam::ACCOUNT:role/LexRole \
  --data-privacy '{"childDirected": false}'

# 2. Import bot definition
aws lexv2-models create-bot-version \
  --bot-id BOT_ID \
  --bot-version-locale-specification file://radscheduler-bot-definition.json
```

### Step 3: Deploy Lambda Functions

```bash
# 1. Package function
cd aws-connect/lambdas/check-availability
npm install
zip -r function.zip .

# 2. Create function
aws lambda create-function \
  --function-name radscheduler-check-availability \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT:role/LambdaRole \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --environment Variables='{
    "API_URL":"https://api.radscheduler.com",
    "DEFAULT_ORG_ID":"memorial-radiology"
  }'

# 3. Grant Lex permission
aws lambda add-permission \
  --function-name radscheduler-check-availability \
  --statement-id lex-invoke \
  --action lambda:InvokeFunction \
  --principal lex.amazonaws.com
```

### Step 4: Configure Integration

```bash
# 1. Associate Lex bot with Connect
aws connect associate-bot \
  --instance-id INSTANCE_ID \
  --lex-v2-bot '{
    "AliasArn": "arn:aws:lex:us-east-1:ACCOUNT:bot-alias/BOT_ID/PROD"
  }'

# 2. Set up routing
aws connect create-routing-profile \
  --instance-id INSTANCE_ID \
  --name "AI-First" \
  --default-outbound-queue-id QUEUE_ID
```

### Step 5: Test the System

```bash
# Test call flow
aws connect start-outbound-voice-contact \
  --destination-phone-number "+1234567890" \
  --contact-flow-id FLOW_ID \
  --instance-id INSTANCE_ID \
  --source-phone-number "+1987654321"
```

## Sample Conversation Flow

```
AI: "Welcome to Memorial Radiology scheduling. I'm your AI assistant.
     You can say things like 'Book an MRI' or 'Schedule an X-ray'.
     How can I help you today?"

Patient: "I need to schedule an MRI"

AI: "I can help you schedule an MRI. What date would you prefer?"

Patient: "Next Tuesday"

AI: "What time works best for you? We have slots from 7 AM to 7 PM."

Patient: "Morning would be good"

AI: "I have the following MRI appointments available:
     Tuesday, January 16th at 8:00 AM,
     Tuesday, January 16th at 9:30 AM,
     and Tuesday, January 16th at 11:00 AM.
     Would you like to book one of these times?"

Patient: "9:30 sounds perfect"

AI: "What's the best phone number to send your confirmation to?"

Patient: "555-0123"

AI: "I have you down for an MRI on Tuesday, January 16th at 9:30 AM.
     Should I confirm this appointment?"

Patient: "Yes"

AI: "Perfect! Your appointment has been scheduled.
     You'll receive an SMS confirmation shortly with all the details
     and any preparation instructions."
```

## Monitoring & Analytics

### CloudWatch Dashboards

Create dashboard for:
- Call volume and duration
- Bot success/failure rates
- Lambda execution times
- API response times
- Transfer-to-agent rate

### Key Metrics
```javascript
// Track in CloudWatch
const metrics = {
  'BookingSuccess': count,
  'BookingFailure': count,
  'AverageCallDuration': seconds,
  'TransferRate': percentage,
  'SlotFillRate': percentage
};
```

## Cost Estimation

| Service | Usage | Cost |
|---------|-------|------|
| AWS Connect | 1000 min/day | $18/day |
| Lex | 1000 requests/day | $4/day |
| Lambda | 1000 invocations/day | $0.20/day |
| CloudWatch | Logs & metrics | $5/day |
| **Total** | **Daily estimate** | **~$27/day** |

## Troubleshooting

### Common Issues

**Bot not responding**:
- Check Lex bot is built and published
- Verify bot association with Connect
- Check Lambda function permissions

**Calls dropping**:
- Verify contact flow error handling
- Check Lambda timeout settings (8 seconds)
- Review CloudWatch logs

**PHI in logs**:
- Enable Comprehend Medical redaction
- Review CloudWatch log filters
- Audit Lambda logging statements

## Security Best Practices

1. **Encryption**
   - Enable Connect encryption at rest
   - Use TLS 1.2+ for all API calls
   - Encrypt Lambda environment variables

2. **Access Control**
   - Use IAM roles with least privilege
   - Enable MFA for Connect console
   - Restrict Lambda function access

3. **Audit**
   - Enable AWS CloudTrail
   - Log all Lex conversations
   - Monitor for anomalies

4. **PHI Handling**
   - Never log full phone numbers
   - Redact patient names in logs
   - Use session attributes for temporary data

## Next Steps

1. **Enhance Bot Intelligence**
   - Add more intents (insurance verification, directions)
   - Integrate with Claude for complex queries
   - Add multilingual support

2. **Improve Analytics**
   - Connect to Amazon QuickSight
   - Build predictive no-show models
   - Track conversion rates

3. **Scale Operations**
   - Add more phone numbers
   - Implement queue callbacks
   - Add after-hours messaging

## Support

For issues or questions:
- AWS Connect Documentation: https://docs.aws.amazon.com/connect/
- Amazon Lex Guide: https://docs.aws.amazon.com/lex/
- RadScheduler Team: support@radscheduler.com
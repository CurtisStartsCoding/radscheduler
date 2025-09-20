# Voice AI System - Next Steps

## Current Status ✅
- IAM Roles created
- DynamoDB tables created
- S3 bucket created
- Secrets Manager configured
- Lambda function code ready

## What You Need to Deploy Next

### 1. Deploy Lambda Functions (5 minutes)
```bash
cd voice-ai-booking
chmod +x deploy-lambdas.sh

# Use RadScheduler AWS profile
export AWS_CONFIG_FILE=/c/Apps/radscheduler/.aws/config
export AWS_SHARED_CREDENTIALS_FILE=/c/Apps/radscheduler/.aws/credentials
export AWS_PROFILE=radscheduler

./deploy-lambdas.sh
```

### 2. Create AWS Connect Instance (10 minutes)

**Via AWS Console:**
1. Go to Amazon Connect console
2. Click "Create instance"
3. Configure:
   - Instance alias: `radscheduler-voice`
   - Identity management: Store users in Connect
   - Admin: Create new admin
   - Telephony: Inbound calls only
   - Data storage: Use existing S3 bucket (`voice-ai-recordings-prod-*`)

**Get a Phone Number:**
1. In Connect instance, go to "Phone numbers"
2. Click "Claim a number"
3. Choose country/type (toll-free recommended)
4. Save the number for testing

### 3. Create Amazon Lex Bot (15 minutes)

**Create the Bot:**
```bash
# Create Lex bot with our configuration
aws lex-models put-bot \
  --name RadSchedulerBot \
  --locale en_US \
  --child-directed false \
  --voice-id Joanna \
  --idle-session-ttl-in-seconds 300 \
  --role-arn arn:aws:iam::377602329041:role/voice-ai-lex-role
```

**Add Intents:**
- BookAppointment
- CheckAvailability
- RescheduleAppointment
- CancelAppointment

**Configure Slots:**
- ProcedureType: MRI, CT, X-Ray, Ultrasound
- PreferredDate: AMAZON.DATE
- PreferredTime: AMAZON.TIME
- PhoneNumber: AMAZON.PhoneNumber

### 4. Link Everything Together

**Connect Lambda to Lex:**
```bash
# Give Lex permission to invoke Lambda
aws lambda add-permission \
  --function-name voice-ai-book-appointment \
  --statement-id lex-invoke \
  --action lambda:InvokeFunction \
  --principal lex.amazonaws.com
```

**Import Contact Flow to Connect:**
1. In Connect console, go to "Contact flows"
2. Create new flow
3. Import the flow from: `aws-connect/contact-flows/appointment-booking-flow.json`
4. Publish the flow

**Link Phone Number to Flow:**
1. Go to "Phone numbers" in Connect
2. Edit your claimed number
3. Set Contact flow to your appointment booking flow
4. Save

### 5. Update Lambda Environment Variables

**Important:** Update with your actual RadScheduler API endpoint:
```bash
aws lambda update-function-configuration \
  --function-name voice-ai-book-appointment \
  --environment Variables="{
    RADSCHEDULER_API_URL='https://your-api-url.com',
    VOICE_API_KEY='your-voice-api-key'
  }"
```

### 6. Test the System

1. **Call the phone number** you claimed
2. **Say:** "I'd like to book an MRI appointment"
3. **Follow the prompts** for date/time
4. **Check logs:**
   ```bash
   # Lambda logs
   aws logs tail /aws/lambda/voice-ai-book-appointment --follow

   # DynamoDB entries
   aws dynamodb scan --table-name voice-ai-call-logs
   ```

## Architecture Summary

```
Patient Calls → AWS Connect Phone Number
                    ↓
            Contact Flow Starts
                    ↓
            Invokes Lex Bot
                    ↓
        Lex Processes Intent
                    ↓
      Lambda Function Called
                    ↓
    RadScheduler API Request
                    ↓
      Appointment Created
                    ↓
    SMS Confirmation Sent
```

## Troubleshooting

### Lambda Not Working?
- Check CloudWatch logs: `aws logs tail /aws/lambda/voice-ai-book-appointment`
- Verify environment variables are set
- Check IAM role has necessary permissions

### Connect Not Answering?
- Verify phone number is active
- Check contact flow is published
- Ensure flow is assigned to phone number

### Lex Not Understanding?
- Test in Lex console first
- Check slot types are configured
- Verify Lambda fulfillment is enabled

### API Connection Failed?
- Check Lambda can reach your API (network/security groups)
- Verify API key in Secrets Manager
- Test with curl first

## Cost Estimates

- **AWS Connect:** $0.018 per minute
- **Lex:** $0.004 per voice request
- **Lambda:** ~$0.0000002 per request
- **DynamoDB:** ~$0.25 per million requests
- **Total:** ~$2-3 per 100 calls

## Security Checklist

- [ ] Lambda functions in VPC if needed
- [ ] Secrets rotated regularly
- [ ] CloudWatch logs encrypted
- [ ] DynamoDB encryption enabled
- [ ] S3 bucket lifecycle policies set
- [ ] Connect recordings encrypted

## Support

For issues, check:
1. CloudWatch Logs
2. Connect contact flow logs
3. Lambda function logs
4. DynamoDB audit table
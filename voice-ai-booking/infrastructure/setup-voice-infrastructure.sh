#!/bin/bash

# Voice AI Booking System - Infrastructure Setup
# COMPLETELY SEPARATE from RadScheduler

set -e

echo "================================================"
echo "Voice AI Booking - Independent Infrastructure Setup"
echo "================================================"

# IMPORTANT: Check if using correct AWS profile
if [ "$AWS_PROFILE" != "radscheduler" ]; then
    echo -e "${RED}WARNING: AWS_PROFILE is not set to 'radscheduler'${NC}"
    echo "Current profile: ${AWS_PROFILE:-default}"
    echo ""
    echo "To use RadScheduler profile, run:"
    echo "  AWS_PROFILE=radscheduler $0"
    echo ""
    echo "To continue with current profile, press Enter (or Ctrl+C to cancel)"
    read -r
fi

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
ENVIRONMENT=${ENVIRONMENT:-prod}
SYSTEM_PREFIX="voice-ai"  # NOT radscheduler or radorderpad!

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Voice AI infrastructure...${NC}"

# 1. Create IAM Roles
echo -e "${YELLOW}Creating IAM roles for voice system...${NC}"

# Connect Service Role
aws iam create-role \
  --role-name ${SYSTEM_PREFIX}-connect-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "connect.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} \
  || echo "Connect role already exists"

# Lambda Execution Role
aws iam create-role \
  --role-name ${SYSTEM_PREFIX}-lambda-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} \
  || echo "Lambda role already exists"

# Lex Bot Role
aws iam create-role \
  --role-name ${SYSTEM_PREFIX}-lex-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lex.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} \
  || echo "Lex role already exists"

# 2. Attach Policies
echo -e "${YELLOW}Attaching policies...${NC}"

# Lambda policy for CloudWatch, Secrets Manager, DynamoDB
aws iam attach-role-policy \
  --role-name ${SYSTEM_PREFIX}-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy \
  --role-name ${SYSTEM_PREFIX}-lambda-role \
  --policy-name VoiceAILambdaPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "secretsmanager:GetSecretValue",
          "comprehendmedical:DetectPHI",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "kms:Decrypt"
        ],
        "Resource": "*"
      }
    ]
  }'

# 3. Create Secrets Manager entries
echo -e "${YELLOW}Creating Secrets Manager entries...${NC}"

# RadScheduler API credentials (for voice system to call)
aws secretsmanager create-secret \
  --name ${SYSTEM_PREFIX}/radscheduler-api \
  --description "RadScheduler API credentials for voice system" \
  --secret-string '{
    "endpoint": "https://api.radscheduler.com",
    "apiKey": "VOICE_SYSTEM_API_KEY_PLACEHOLDER",
    "timeout": 5000
  }' \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} \
  || echo "Secret already exists"

# Twilio credentials (for SMS from voice system)
aws secretsmanager create-secret \
  --name ${SYSTEM_PREFIX}/twilio \
  --description "Twilio credentials for voice confirmations" \
  --secret-string '{
    "accountSid": "TWILIO_ACCOUNT_SID",
    "authToken": "TWILIO_AUTH_TOKEN",
    "phoneNumber": "+1234567890"
  }' \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} \
  || echo "Twilio secret already exists"

# 4. Create DynamoDB tables for voice audit logs
echo -e "${YELLOW}Creating DynamoDB tables...${NC}"

# Voice calls audit table
aws dynamodb create-table \
  --table-name ${SYSTEM_PREFIX}-call-logs \
  --attribute-definitions \
    AttributeName=callSid,AttributeType=S \
    AttributeName=timestamp,AttributeType=N \
  --key-schema \
    AttributeName=callSid,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification Enabled=true,SSEType=KMS \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} Key=HIPAA,Value=true \
  || echo "Call logs table already exists"

# Organization phone mapping table
aws dynamodb create-table \
  --table-name ${SYSTEM_PREFIX}-phone-org-mapping \
  --attribute-definitions \
    AttributeName=phoneNumber,AttributeType=S \
  --key-schema \
    AttributeName=phoneNumber,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification Enabled=true,SSEType=KMS \
  --tags Key=System,Value=VoiceAI Key=Environment,Value=${ENVIRONMENT} \
  || echo "Phone mapping table already exists"

# 5. Create S3 bucket for call recordings
echo -e "${YELLOW}Creating S3 bucket for recordings...${NC}"

BUCKET_NAME="${SYSTEM_PREFIX}-recordings-${ENVIRONMENT}-$(date +%s)"

aws s3api create-bucket \
  --bucket ${BUCKET_NAME} \
  --region ${AWS_REGION} \
  --acl private \
  || echo "Bucket creation failed"

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket ${BUCKET_NAME} \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      }
    }]
  }'

# Set lifecycle policy for HIPAA compliance (7 year retention)
aws s3api put-bucket-lifecycle-configuration \
  --bucket ${BUCKET_NAME} \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "HIPAARetention",
      "Status": "Enabled",
      "Expiration": {
        "Days": 2555
      }
    }]
  }'

# 6. Create CloudWatch Log Groups
echo -e "${YELLOW}Creating CloudWatch log groups...${NC}"

aws logs create-log-group \
  --log-group-name /aws/connect/${SYSTEM_PREFIX} \
  || echo "Connect log group exists"

aws logs create-log-group \
  --log-group-name /aws/lambda/${SYSTEM_PREFIX} \
  || echo "Lambda log group exists"

# Set retention
aws logs put-retention-policy \
  --log-group-name /aws/connect/${SYSTEM_PREFIX} \
  --retention-in-days 2555  # 7 years for HIPAA

aws logs put-retention-policy \
  --log-group-name /aws/lambda/${SYSTEM_PREFIX} \
  --retention-in-days 2555

# 7. Create AWS Connect Instance
echo -e "${YELLOW}Creating AWS Connect instance...${NC}"

CONNECT_RESPONSE=$(aws connect create-instance \
  --identity-management-type CONNECT_MANAGED \
  --instance-alias ${SYSTEM_PREFIX}-booking \
  --inbound-calls-enabled \
  --outbound-calls-enabled)

INSTANCE_ID=$(echo $CONNECT_RESPONSE | jq -r '.Id')

if [ "$INSTANCE_ID" != "null" ]; then
  echo -e "${GREEN}Connect instance created: ${INSTANCE_ID}${NC}"

  # Save instance ID
  echo $INSTANCE_ID > .connect-instance-id

  # Wait for instance to be active
  echo "Waiting for Connect instance to be active..."
  aws connect describe-instance \
    --instance-id $INSTANCE_ID \
    --query 'Instance.InstanceStatus' \
    --output text
else
  echo -e "${RED}Failed to create Connect instance${NC}"
fi

# 8. Output summary
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Voice AI Infrastructure Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next Steps:"
echo "1. Deploy Lambda functions: cd ../lambdas && ./deploy-all.sh"
echo "2. Configure Lex bot: cd ../aws-connect && ./setup-lex-bot.sh"
echo "3. Import contact flows to Connect"
echo "4. Claim phone numbers in Connect console"
echo "5. Configure phone-to-org mappings"
echo ""
echo "Resources created:"
echo "- IAM Roles: ${SYSTEM_PREFIX}-connect-role, ${SYSTEM_PREFIX}-lambda-role, ${SYSTEM_PREFIX}-lex-role"
echo "- DynamoDB Tables: ${SYSTEM_PREFIX}-call-logs, ${SYSTEM_PREFIX}-phone-org-mapping"
echo "- S3 Bucket: ${BUCKET_NAME}"
echo "- Secrets: ${SYSTEM_PREFIX}/radscheduler-api, ${SYSTEM_PREFIX}/twilio"
echo "- Connect Instance: ${INSTANCE_ID:-Check AWS Console}"
echo ""
echo -e "${YELLOW}Remember: This is COMPLETELY SEPARATE from RadScheduler!${NC}"
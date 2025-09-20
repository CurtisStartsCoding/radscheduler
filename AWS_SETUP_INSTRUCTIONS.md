# AWS Setup Instructions for RadScheduler Voice AI

## IMPORTANT: Keep RadScheduler and RadOrderPad Separate!

RadScheduler and RadOrderPad are **completely separate projects** and must use different AWS credentials to avoid any cross-contamination.

## Step 1: Create AWS IAM User for RadScheduler

1. Log into AWS Console (https://console.aws.amazon.com)
2. Go to IAM → Users → Create User
3. Username: `radscheduler-service`
4. Select "Programmatic access"
5. Attach these policies for Voice AI deployment:
   - `IAMFullAccess` (for creating roles)
   - `AWSLambda_FullAccess`
   - `AmazonConnect_FullAccess`
   - `AmazonLexFullAccess`
   - `AmazonDynamoDBFullAccess`
   - `CloudWatchLogsFullAccess`

   Note: For production, create a custom policy with minimum required permissions.

6. Save the Access Key ID and Secret Access Key

## Step 2: Configure AWS Profile for RadScheduler

Edit your AWS credentials file:

**Windows:** `C:\Users\%USERNAME%\.aws\credentials`
**Mac/Linux:** `~/.aws/credentials`

Add this section:
```ini
[radscheduler]
aws_access_key_id = YOUR_RADSCHEDULER_ACCESS_KEY
aws_secret_access_key = YOUR_RADSCHEDULER_SECRET_KEY
```

## Step 3: Configure AWS Config

Edit your AWS config file:

**Windows:** `C:\Users\%USERNAME%\.aws\config`
**Mac/Linux:** `~/.aws/config`

Add this section:
```ini
[profile radscheduler]
region = us-east-1
output = json
```

## Step 4: Test the Profile

```bash
# Test RadScheduler profile
AWS_PROFILE=radscheduler aws sts get-caller-identity

# Should show:
# "Arn": "arn:aws:iam::YOUR_ACCOUNT:user/radscheduler-service"
```

## Step 5: Deploy Voice AI Infrastructure

```bash
cd voice-ai-booking/infrastructure

# Use RadScheduler profile for deployment
AWS_PROFILE=radscheduler ./setup-voice-infrastructure.sh
```

## Verification Checklist

- [ ] RadScheduler uses profile `radscheduler`
- [ ] RadOrderPad uses default profile or `radorderpad`
- [ ] No shared IAM roles between projects
- [ ] No shared S3 buckets between projects
- [ ] No shared Lambda functions between projects
- [ ] Resource naming follows pattern:
  - RadScheduler: `voice-ai-*` or `radscheduler-*`
  - RadOrderPad: `radorderpad-*`

## Environment Variables for Deployment

When deploying, always specify the profile:
```bash
export AWS_PROFILE=radscheduler
# or
AWS_PROFILE=radscheduler command
```

## Troubleshooting

If you see "radorderpad" in any AWS resource names or ARNs while working on RadScheduler:
1. Stop immediately
2. Check your AWS_PROFILE
3. Ensure you're using the correct credentials

## Security Notes

1. Never commit AWS credentials to git
2. Use different AWS accounts for production vs development
3. Enable MFA on AWS accounts
4. Rotate credentials regularly
5. Use IAM roles instead of users when possible

## Contact

If you need help setting up AWS credentials or have questions about keeping the projects separate, please reach out to your team lead.
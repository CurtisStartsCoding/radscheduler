#!/bin/bash

# Deploy Lambda Functions for Voice AI Booking

set -e

echo "================================================"
echo "Deploying Voice AI Lambda Functions"
echo "================================================"

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
LAMBDA_ROLE_ARN="arn:aws:iam::377602329041:role/voice-ai-lambda-role"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to deploy a Lambda
deploy_lambda() {
    local FUNCTION_NAME=$1
    local FUNCTION_DIR=$2
    local HANDLER=$3

    echo -e "${YELLOW}Deploying $FUNCTION_NAME...${NC}"

    # Navigate to function directory
    cd lambdas/$FUNCTION_DIR

    # Install dependencies if package.json exists
    if [ -f "package.json" ]; then
        npm install --production
    fi

    # Create deployment package
    zip -r ../../deployment-$FUNCTION_NAME.zip . -x "*.git*" "*.md"

    # Go back to parent directory
    cd ../..

    # Check if function exists
    aws lambda get-function --function-name $FUNCTION_NAME 2>/dev/null
    if [ $? -eq 0 ]; then
        # Update existing function
        echo "Updating existing function..."
        aws lambda update-function-code \
            --function-name $FUNCTION_NAME \
            --zip-file fileb://deployment-$FUNCTION_NAME.zip \
            --region $AWS_REGION

        aws lambda update-function-configuration \
            --function-name $FUNCTION_NAME \
            --environment Variables="{RADSCHEDULER_API_URL='http://localhost:3010',VOICE_API_KEY='test-voice-api-key-change-in-production'}" \
            --timeout 30 \
            --memory-size 256 \
            --region $AWS_REGION
    else
        # Create new function
        echo "Creating new function..."
        aws lambda create-function \
            --function-name $FUNCTION_NAME \
            --runtime nodejs18.x \
            --role $LAMBDA_ROLE_ARN \
            --handler $HANDLER \
            --zip-file fileb://deployment-$FUNCTION_NAME.zip \
            --timeout 30 \
            --memory-size 256 \
            --environment Variables="{RADSCHEDULER_API_URL='http://localhost:3010',VOICE_API_KEY='test-voice-api-key-change-in-production'}" \
            --region $AWS_REGION
    fi

    # Clean up
    rm deployment-$FUNCTION_NAME.zip

    echo -e "${GREEN}✓ $FUNCTION_NAME deployed${NC}"
    echo
}

# Deploy each Lambda function
deploy_lambda "voice-ai-check-availability" "voice-check-availability" "index.handler"
deploy_lambda "voice-ai-book-appointment" "voice-book-appointment" "index.handler"

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}All Lambda functions deployed successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo
echo "Next steps:"
echo "1. Update the Lambda environment variables with your actual API URL"
echo "2. Create the Lex bot and link these Lambda functions"
echo "3. Create the AWS Connect instance and contact flows"
echo
echo "To update environment variables:"
echo "  aws lambda update-function-configuration \\"
echo "    --function-name voice-ai-book-appointment \\"
echo "    --environment Variables=\"{RADSCHEDULER_API_URL='https://your-api.com'}\""
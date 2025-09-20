#!/bin/bash

# RadScheduler EC2 Deployment Script
# Deploys the API to an EC2 instance

set -e

echo "================================================"
echo "RadScheduler EC2 Deployment"
echo "================================================"

# Configuration
EC2_HOST="50.19.63.140"            # RadScheduler EC2 instance
EC2_USER="ubuntu"                  # Ubuntu user
KEY_PATH="./radscheduler-key.pem" # Path to your EC2 key file
DEPLOY_PATH="/home/ubuntu/radscheduler"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if EC2_HOST is configured
if [ -z "$EC2_HOST" ]; then
    echo -e "${RED}ERROR: EC2_HOST is not configured${NC}"
    exit 1
fi

echo -e "${YELLOW}Deploying to: $EC2_HOST${NC}"

# 1. Push latest code to git
echo -e "${YELLOW}1. Pushing code to git...${NC}"
git push origin master

# 2. Connect to EC2 and pull latest code
echo -e "${YELLOW}2. Deploying to EC2...${NC}"

ssh -i $KEY_PATH $EC2_USER@$EC2_HOST << 'ENDSSH'
    set -e

    # Navigate to app directory (clone if doesn't exist)
    if [ ! -d "/home/ubuntu/radscheduler" ]; then
        echo "First time setup - cloning repository..."
        cd /home/ubuntu
        git clone https://github.com/yourusername/radscheduler.git
    fi

    cd /home/ubuntu/radscheduler

    # Pull latest code
    echo "Pulling latest code..."
    git pull origin master

    # Install dependencies
    echo "Installing API dependencies..."
    cd api
    npm install --production

    # Copy environment file if doesn't exist
    if [ ! -f ".env" ]; then
        echo "Creating .env file..."
        cp .env.example .env
        echo "IMPORTANT: Update .env with production values!"
    fi

    # Run database migrations
    echo "Running database migrations..."
    for sql_file in scripts/*.sql; do
        echo "Running $sql_file..."
        psql $DATABASE_URL -f $sql_file || true
    done

    # Install PM2 if not installed
    if ! command -v pm2 &> /dev/null; then
        echo "Installing PM2..."
        sudo npm install -g pm2
    fi

    # Restart application with PM2
    echo "Starting/Restarting application..."
    pm2 stop radscheduler-api || true
    pm2 start src/server.js --name radscheduler-api
    pm2 save
    pm2 startup || true

    echo "Deployment complete!"
    echo "API running on port 3010"
ENDSSH

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo "1. SSH into EC2 and update the .env file with production values"
echo "2. Set up nginx to proxy port 80/443 to 3010"
echo "3. Configure SSL certificate (use Let's Encrypt)"
echo "4. Update Voice AI Lambda with EC2 endpoint"
echo ""
echo "Your API endpoint will be: http://$EC2_HOST:3010"
echo ""
echo "To check status:"
echo "  ssh -i $KEY_PATH $EC2_USER@$EC2_HOST 'pm2 status'"
echo ""
echo "To view logs:"
echo "  ssh -i $KEY_PATH $EC2_USER@$EC2_HOST 'pm2 logs radscheduler-api'"
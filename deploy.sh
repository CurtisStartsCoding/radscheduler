#!/bin/bash

# RadScheduler Deployment Script
# Simple SCP-based deployment to EC2

set -e  # Exit on error

# Configuration
EC2_HOST="3.21.14.188"
EC2_USER="ubuntu"
SSH_KEY="../radorderpad-api/temp/radorderpad-ssh-access.pem"
APP_NAME="radscheduler"
DEPLOY_ARCHIVE="radscheduler-deploy.tar.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting RadScheduler deployment...${NC}"

# Step 1: Package the application
echo -e "${YELLOW}[1/5] Packaging application...${NC}"
tar -czf $DEPLOY_ARCHIVE \
  --exclude=node_modules \
  --exclude=.env \
  --exclude='*.log' \
  api/ \
  package.json \
  package-lock.json

echo -e "${GREEN}✓ Package created: $DEPLOY_ARCHIVE${NC}"

# Step 2: Copy to EC2
echo -e "${YELLOW}[2/5] Copying to EC2...${NC}"
scp -i "$SSH_KEY" $DEPLOY_ARCHIVE ${EC2_USER}@${EC2_HOST}:~

echo -e "${GREEN}✓ Files copied to EC2${NC}"

# Step 3: Deploy on EC2
echo -e "${YELLOW}[3/5] Deploying on EC2...${NC}"
ssh -i "$SSH_KEY" ${EC2_USER}@${EC2_HOST} << 'ENDSSH'
  set -e

  # Backup existing directory if it exists
  if [ -d "radscheduler-backup" ]; then
    rm -rf radscheduler-backup
  fi
  if [ -d "radscheduler" ]; then
    mv radscheduler radscheduler-backup
  fi

  # Extract fresh archive
  mkdir -p radscheduler
  tar -xzf radscheduler-deploy.tar.gz -C radscheduler --strip-components=0

  # Copy .env from backup if exists
  if [ -f "radscheduler-backup/api/.env" ]; then
    cp radscheduler-backup/api/.env radscheduler/api/.env
  fi

  # Install dependencies in api directory
  cd radscheduler/api
  npm install --production
  cd ..

  # Restart PM2 service
  pm2 restart radscheduler-api || pm2 start api/src/server.js --name radscheduler-api

  echo "Deployment complete on EC2"
ENDSSH

echo -e "${GREEN}✓ Application deployed${NC}"

# Step 4: Verify service is running
echo -e "${YELLOW}[4/5] Verifying service status...${NC}"
ssh -i "$SSH_KEY" ${EC2_USER}@${EC2_HOST} "pm2 status radscheduler-api"

# Step 5: Show recent logs
echo -e "${YELLOW}[5/5] Recent logs:${NC}"
ssh -i "$SSH_KEY" ${EC2_USER}@${EC2_HOST} "pm2 logs radscheduler-api --lines 20 --nostream"

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "To view logs: ssh -i \"$SSH_KEY\" ${EC2_USER}@${EC2_HOST} \"pm2 logs radscheduler-api\""

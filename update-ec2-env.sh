#!/bin/bash
# Script to update EC2 environment variables

EC2_HOST="50.19.63.140"
EC2_USER="ubuntu"
PEM_FILE="C:/Users/JB/radscheduler-ec2-keypair.pem"

echo "Updating EC2 environment variables..."

# SSH into EC2 and update the .env file
ssh -i "$PEM_FILE" $EC2_USER@$EC2_HOST << 'EOF'
cd /home/ubuntu/radscheduler/api

# Backup current .env
cp .env .env.backup

# Add Retell API key
echo "" >> .env
echo "# Retell AI for voice system" >> .env
echo "RETELL_API_KEY=key_468b94fa926bba0c36d3e54dd854" >> .env
echo "RETELL_AGENT_ID=" >> .env

echo "Environment variables updated"

# Check if PM2 is running
pm2 list

# Restart the application
echo "Restarting application..."
pm2 restart all

# Check logs
echo "Checking logs for Retell initialization..."
sleep 3
pm2 logs --lines 20 | grep -i "retell"

EOF

echo "EC2 update complete"
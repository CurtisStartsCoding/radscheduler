#!/bin/bash

# Initial EC2 Setup Script for RadScheduler
# Run this once when setting up a new EC2 instance

set -e

echo "================================================"
echo "RadScheduler EC2 Initial Setup"
echo "================================================"

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18.x
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build essentials
sudo apt-get install -y build-essential

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Install PostgreSQL client
echo "Installing PostgreSQL client..."
sudo apt-get install -y postgresql-client

# Install nginx
echo "Installing nginx..."
sudo apt-get install -y nginx

# Configure nginx as reverse proxy
echo "Configuring nginx..."
sudo tee /etc/nginx/sites-available/radscheduler > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:3010/api/health;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/radscheduler /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

# Setup PM2 to start on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
sudo systemctl enable pm2-ubuntu

# Create app directory if it doesn't exist
if [ ! -d "/home/ubuntu/radscheduler" ]; then
    echo "Creating application directory..."
    mkdir -p /home/ubuntu/radscheduler
fi

echo "================================================"
echo "Initial setup complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Clone your repository to /home/ubuntu/radscheduler"
echo "2. Copy .env file with production values"
echo "3. Install dependencies: cd api && npm install"
echo "4. Start app: pm2 start api/src/server.js --name radscheduler-api"
echo "5. Save PM2 config: pm2 save"
echo ""
echo "Your server is now accessible on port 80"
# GitHub Actions Setup for Auto-Deployment

## Prerequisites
- GitHub repository
- EC2 instance running (already created at 50.19.63.140)
- SSH access to EC2

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret" and add:

### 1. EC2_HOST
- **Value:** `50.19.63.140`
- Your EC2 instance public IP

### 2. EC2_USER
- **Value:** `ubuntu`
- The SSH user for your EC2 instance

### 3. EC2_SSH_KEY
- **Value:** Contents of `radscheduler-key.pem`
- Copy the entire contents of your SSH private key file
- Include the BEGIN and END lines

## How It Works

1. **Trigger:** Pushes to `master` or `main` branch
2. **Paths:** Only deploys when changes are made to:
   - `api/**` - API source code
   - `package*.json` - Dependencies
   - `.github/workflows/deploy.yml` - Workflow itself

3. **Deployment Process:**
   - Connects to EC2 via SSH
   - Pulls latest code from git
   - Installs/updates dependencies
   - Runs database migrations
   - Restarts the application with PM2

## Initial EC2 Setup

Before the first auto-deployment, you need to:

1. SSH into your EC2 instance:
   ```bash
   ssh -i radscheduler-key.pem ubuntu@50.19.63.140
   ```

2. Run the initial setup script:
   ```bash
   curl -o setup.sh https://raw.githubusercontent.com/yourusername/radscheduler/master/scripts/setup-ec2.sh
   chmod +x setup.sh
   ./setup.sh
   ```

3. Clone your repository:
   ```bash
   cd /home/ubuntu
   git clone https://github.com/yourusername/radscheduler.git
   cd radscheduler
   ```

4. Create and configure `.env` file:
   ```bash
   cd api
   cp .env.example .env
   nano .env  # Edit with your production values
   ```

5. Install dependencies and start:
   ```bash
   npm install --production
   pm2 start src/server.js --name radscheduler-api
   pm2 save
   ```

## Testing the Workflow

1. Make a small change to any file in `api/`
2. Commit and push:
   ```bash
   git add .
   git commit -m "test: trigger deployment"
   git push origin master
   ```
3. Check Actions tab in GitHub to monitor deployment
4. Verify changes at http://50.19.63.140

## Monitoring

- **GitHub Actions:** Check the Actions tab for deployment status
- **Application Logs:** SSH to EC2 and run `pm2 logs radscheduler-api`
- **PM2 Status:** `pm2 status`
- **Nginx Logs:** `sudo tail -f /var/log/nginx/access.log`

## Rollback

If deployment fails:

1. SSH to EC2
2. Revert to previous commit:
   ```bash
   cd /home/ubuntu/radscheduler
   git log --oneline  # Find the previous good commit
   git reset --hard <commit-hash>
   cd api
   pm2 restart radscheduler-api
   ```

## Security Notes

- Never commit the `.pem` file to the repository
- Keep GitHub secrets secure
- Regularly rotate SSH keys
- Use environment-specific `.env` files
- Consider using AWS Secrets Manager for production
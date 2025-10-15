# RadScheduler Deployment Guide

## Quick Deployment

To deploy RadScheduler to EC2:

```bash
bash deploy.sh
```

That's it! The script handles everything automatically.

## What the Deployment Script Does

The `deploy.sh` script performs the following steps:

1. **Packages the application** - Creates a tarball with:
   - `api/` directory (source code and config)
   - `package.json` and `package-lock.json`
   - Excludes: `node_modules`, `.env`, `*.log`

2. **Copies to EC2** - SCPs the package to the server

3. **Deploys on server**:
   - Backs up existing deployment
   - Extracts fresh code
   - Preserves `.env` file from backup
   - Installs npm dependencies in `api/` directory
   - Restarts PM2 service

4. **Verifies deployment** - Shows PM2 status and recent logs

5. **Shows recent logs** - Displays last 20 log lines

## Configuration

The deploy script uses these settings (configured at the top of `deploy.sh`):

```bash
EC2_HOST="3.21.14.188"
EC2_USER="ubuntu"
SSH_KEY="../radorderpad-api/temp/radorderpad-ssh-access.pem"
APP_NAME="radscheduler"
```

## Requirements

- SSH key at `../radorderpad-api/temp/radorderpad-ssh-access.pem`
- Git Bash or WSL (for Windows)
- SSH access to EC2 instance
- PM2 installed on EC2 server

## Server Setup

The server expects:
- PM2 service named `radscheduler-api`
- `.env` file in `~/radscheduler/api/.env` with:
  - `DATABASE_URL` - PostgreSQL connection string
  - `TWILIO_ACCOUNT_SID` - Twilio account SID
  - `TWILIO_AUTH_TOKEN` - Twilio auth token
  - `TWILIO_PHONE_NUMBER` - Twilio phone number
  - `PORT` - Server port (default: 3010)

## Deployment Fixes Applied

### 1. Database SSL Connection
**Issue**: PostgreSQL rejected connections without SSL
**Fix**: Added SSL config to `api/src/db/connection.js`:
```javascript
ssl: {
  rejectUnauthorized: false
}
```

### 2. Missing Config File
**Issue**: `patient-scheduling.js` required `../config/scheduling` which didn't exist
**Fix**: Created `api/src/config/scheduling.js` with stub configuration:
- Patient self-scheduling disabled by default
- Empty allowed modalities list
- Standard business hours (8am-5pm)

### 3. NPM Install Path
**Issue**: Dependencies installed in wrong directory
**Fix**: Changed script to run `npm install` in `api/` directory where `package.json` exists

## Viewing Logs

After deployment, you can view logs with:

```bash
ssh -i "../radorderpad-api/temp/radorderpad-ssh-access.pem" ubuntu@3.21.14.188 "pm2 logs radscheduler-api"
```

Or use PM2 commands directly on the server:
```bash
pm2 status radscheduler-api    # Check status
pm2 logs radscheduler-api      # View live logs
pm2 restart radscheduler-api   # Restart service
```

## Rollback

If deployment fails, the script automatically preserves the previous version:

```bash
ssh -i "../radorderpad-api/temp/radorderpad-ssh-access.pem" ubuntu@3.21.14.188
cd ~
rm -rf radscheduler
mv radscheduler-backup radscheduler
pm2 restart radscheduler-api
```

## Troubleshooting

### "Permission denied (publickey)"
- Verify SSH key exists at the configured path
- Check SSH key permissions: `chmod 400 <key-file>`

### "Module not found" errors
- Ensure `npm install` runs in `api/` directory
- Check that `api/package.json` exists in the tarball

### Database connection errors
- Verify `DATABASE_URL` in server's `.env` file
- Check SSL settings match database requirements
- Confirm database allows connections from EC2 IP

### PM2 service not starting
- SSH into server and check logs: `pm2 logs radscheduler-api`
- Verify `.env` file exists: `ls -la ~/radscheduler/api/.env`
- Check PM2 service list: `pm2 list`

## Known Issues

### Session Cleanup Error
Non-fatal error on startup:
```
Failed to cleanup expired SMS sessions: Cannot read properties of undefined (reading 'query')
```

**Impact**: None - server runs normally, cleanup job continues to retry
**Fix**: Pending - needs database schema update for session cleanup

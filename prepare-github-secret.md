# Fix GitHub Actions SSH Key Issue

## The Problem
GitHub Actions is failing at the "Setup SSH Agent" step because the `EC2_SSH_KEY` secret is missing or incorrectly formatted.

## Solution

### Step 1: Find your PEM file
Look for `radscheduler-ec2-keypair.pem` in:
- Downloads folder
- Documents folder
- Desktop
- Or search Windows for `*.pem`

### Step 2: Get the key content
Once you find the file, open it in Notepad and copy the ENTIRE content including:
```
-----BEGIN RSA PRIVATE KEY-----
[all the key content]
-----END RSA PRIVATE KEY-----
```

### Step 3: Add to GitHub Secrets
1. Go to: https://github.com/CurtisStartsCoding/radscheduler/settings/secrets/actions
2. Click "New repository secret"
3. Name: `EC2_SSH_KEY`
4. Value: Paste the ENTIRE PEM file content (including BEGIN and END lines)
5. Click "Add secret"

### Step 4: Verify other secrets are set:
- `EC2_HOST` = 50.19.63.140
- `EC2_USER` = ubuntu

### Step 5: Re-run the workflow
1. Go to: https://github.com/CurtisStartsCoding/radscheduler/actions
2. Click on the latest failed workflow
3. Click "Re-run all jobs"

## Alternative: Manual trigger
If you've made the changes, you can manually trigger:
```bash
git commit --allow-empty -m "Trigger deployment after fixing SSH key"
git push
```
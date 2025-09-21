# PowerShell script to prepare SSH key for GitHub Actions secret
# This formats the PEM file correctly for GitHub Actions

$pemFile = "C:\Users\JB\radscheduler-ec2-keypair.pem"

if (Test-Path $pemFile) {
    # Read the PEM file content
    $pemContent = Get-Content $pemFile -Raw

    # The secret needs to be exactly as it appears in the file
    # with all line breaks preserved
    Write-Host "PEM file found. Copy the following content EXACTLY as shown:"
    Write-Host "================================================================"
    Write-Host $pemContent
    Write-Host "================================================================"
    Write-Host ""
    Write-Host "IMPORTANT: When pasting into GitHub Secrets:"
    Write-Host "1. Copy everything between the lines above (including BEGIN and END lines)"
    Write-Host "2. Paste it EXACTLY as shown - GitHub will preserve the line breaks"
    Write-Host "3. Do NOT modify or reformat the content"
    Write-Host ""
    Write-Host "Go to: https://github.com/CurtisStartsCoding/radscheduler/settings/secrets/actions"
    Write-Host "Secret Name: EC2_SSH_KEY"
} else {
    Write-Host "PEM file not found at: $pemFile"
    Write-Host "Please check the file location"
}
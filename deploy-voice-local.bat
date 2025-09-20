@echo off
REM Deploy Voice AI using local AWS credentials from this folder

echo ================================================
echo RadScheduler Voice AI Deployment
echo Using LOCAL AWS credentials from .aws folder
echo ================================================
echo.

REM Use local .aws folder for credentials
set AWS_CONFIG_FILE=%CD%\.aws\config
set AWS_SHARED_CREDENTIALS_FILE=%CD%\.aws\credentials
set AWS_PROFILE=radscheduler

echo Using AWS credentials from: %CD%\.aws\
echo.

REM Test the credentials work
aws sts get-caller-identity
if %errorlevel% neq 0 (
    echo.
    echo ERROR: AWS credentials not configured!
    echo.
    echo Please add your AWS credentials to:
    echo   %CD%\.aws\credentials
    echo.
    echo Edit the file and replace:
    echo   YOUR_RADSCHEDULER_ACCESS_KEY
    echo   YOUR_RADSCHEDULER_SECRET_KEY
    echo.
    pause
    exit /b 1
)

echo.
echo Press any key to deploy Voice AI infrastructure...
pause >nul

cd voice-ai-booking\infrastructure
bash setup-voice-infrastructure.sh

echo.
echo Deployment complete!
pause
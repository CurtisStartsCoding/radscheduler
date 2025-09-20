@echo off
REM Deploy Voice AI for RadScheduler (NOT RadOrderPad)
REM This ensures we use the correct AWS profile

echo ================================================
echo RadScheduler Voice AI Deployment
echo ================================================
echo.
echo IMPORTANT: This will deploy to AWS using the 'radscheduler' profile
echo Make sure you have set up the radscheduler AWS profile first!
echo (See AWS_SETUP_INSTRUCTIONS.md for details)
echo.
echo Current AWS Identity:
aws sts get-caller-identity --profile radscheduler 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Cannot find 'radscheduler' AWS profile!
    echo.
    echo Please set up your AWS credentials:
    echo 1. Read AWS_SETUP_INSTRUCTIONS.md
    echo 2. Add [radscheduler] profile to ~/.aws/credentials
    echo 3. Run this script again
    echo.
    pause
    exit /b 1
)

echo.
echo Press any key to continue deployment with 'radscheduler' profile...
pause >nul

cd voice-ai-booking\infrastructure
set AWS_PROFILE=radscheduler
bash setup-voice-infrastructure.sh

echo.
echo Deployment complete!
pause
@echo off
REM Finite Intent Executor - Windows Setup
REM Double-click this file or run from Command Prompt

echo.
echo =============================================
echo    Finite Intent Executor - Windows Setup
echo =============================================
echo.

REM Check if PowerShell is available
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: PowerShell is required but not found!
    echo Please install PowerShell or run setup.ps1 directly.
    pause
    exit /b 1
)

REM Run the PowerShell setup script
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo Setup encountered an error. Please check the output above.
    pause
    exit /b 1
)

pause

@echo off
REM Start full development environment
REM Opens Hardhat node, deploys contracts, and starts frontend

echo.
echo =============================================
echo    Starting Development Environment
echo =============================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Dependencies not installed! Running setup first...
    call setup.bat
    if %ERRORLEVEL% neq 0 exit /b 1
)

echo Starting Hardhat node in new window...
start "Hardhat Node" cmd /k "cd /d %~dp0 && npm run node"

echo Waiting for node to start...
timeout /t 5 /nobreak >nul

echo Deploying contracts...
call npm run deploy
if %ERRORLEVEL% neq 0 (
    echo.
    echo Contract deployment failed! Check if Hardhat node is running.
    pause
    exit /b 1
)

echo.
echo Starting frontend in new window...
start "Frontend Dev Server" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo =============================================
echo    Development environment is ready!
echo =============================================
echo.
echo Services running:
echo   - Hardhat Node: http://localhost:8545
echo   - Frontend:     http://localhost:3000
echo.
echo Press any key to open the frontend in your browser...
pause >nul

start http://localhost:3000

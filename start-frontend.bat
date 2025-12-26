@echo off
REM Start frontend development server
echo.
echo Starting frontend development server...
echo.
cd /d "%~dp0frontend"
npm run dev

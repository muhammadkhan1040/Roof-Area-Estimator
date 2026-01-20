@echo off
title RoofPro - Two-Tier Roof Measurement MVP
color 0A

echo ============================================
echo   RoofPro - Starting Application
echo ============================================
echo.

:: Check if we're in the right directory
if not exist "app\main.py" (
    echo ERROR: Please run this file from the roof-estimator directory
    pause
    exit /b 1
)

:: Kill any existing processes on ports 8000 and 5173
echo Stopping any existing servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak > nul

echo [1/2] Starting Backend API on port 8000...
start "RoofPro Backend" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: Wait for backend to start
timeout /t 3 /nobreak > nul

echo [2/2] Starting Frontend on port 5173...
start "RoofPro Frontend" cmd /k "cd frontend && npm run dev"

:: Wait for frontend to start
timeout /t 3 /nobreak > nul

echo.
echo ============================================
echo   Application Started Successfully!
echo ============================================
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000/docs
echo.
echo   Press any key to open in browser...
pause > nul

start http://localhost:5173

echo.
echo To stop the application, close the two terminal windows.
pause

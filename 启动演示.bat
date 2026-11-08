@echo off
setlocal
cd /d "%~dp0web"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install Node.js 18+ then run: npm i -g pnpm
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":5178 .*LISTENING" >nul
if not errorlevel 1 (
  echo TeleScope is already running. Opening browser...
  start "" "http://127.0.0.1:5178"
  exit /b 0
)

if not exist "node_modules" (
  echo Installing dependencies, this may take 1-2 minutes...
  call pnpm install
  if errorlevel 1 (
    echo [ERROR] pnpm install failed. Check your network and try again.
    pause
    exit /b 1
  )
)

echo Starting TeleScope dev server...
start "TeleScope Dev Server" cmd /k "pnpm dev"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5178"
exit /b 0

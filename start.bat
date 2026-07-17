@echo off
setlocal enabledelayedexpansion
title SpiritLens Launcher
cd /d "D:\SpiritLens"
if errorlevel 1 (
    echo Failed to change directory.
    pause
    exit /b 1
)

echo [SpiritLens] Starting services...
echo.

:: --- Redis ---
echo [1/5] Starting Redis ...
tasklist /FI "IMAGENAME eq redis-server.exe" 2>nul | find /I "redis-server" >nul 2>&1
if "%ERRORLEVEL%"=="0" (
    echo   [OK] Redis already running
) else (
    start "Redis" /MIN /D "D:\tools\redis" redis-server.exe "D:\tools\redis\redis.windows.conf"
    if errorlevel 1 (
        echo   [FAIL] Redis failed to start
    ) else (
        timeout /t 2 /nobreak >nul
        echo   [OK] Redis started (port 6379)
    )
)

:: --- PostgreSQL ---
echo [2/5] Starting PostgreSQL ...
tasklist /FI "IMAGENAME eq postgres.exe" 2>nul | find /I "postgres" >nul 2>&1
if "%ERRORLEVEL%"=="0" (
    echo   [OK] PostgreSQL already running
) else (
    "D:\tools\pgsql\bin\pg_ctl.exe" -D "D:\tools\pgsql\data" -l "D:\tools\pgsql\data\pg.log" start >nul 2>&1
    if errorlevel 1 (
        echo   [FAIL] PostgreSQL failed to start
    ) else (
        timeout /t 3 /nobreak >nul
        echo   [OK] PostgreSQL started (port 5432)
    )
)

:: --- Celery Worker ---
echo [3/5] Starting Celery Worker ...
start "Celery" /MIN /D "D:\SpiritLens\backend" cmd /c "venv\Scripts\activate 1>nul 2>&1 && celery -A app.celery_app worker --pool=threads --concurrency=4 --loglevel=info"
echo   [OK] Celery Worker started

:: --- Backend (Uvicorn) ---
echo [4/5] Starting Backend ...
start "Backend" /MIN /D "D:\SpiritLens\backend" cmd /c "venv\Scripts\activate 1>nul 2>&1 && uvicorn app.main:app --port 8085"
echo   [OK] Backend started (port 8085)

:: --- Frontend (Next.js) ---
echo [5/5] Starting Frontend ...
start "Frontend" /MIN /D "D:\SpiritLens\frontend" cmd /c "npx next dev --port 3005 --hostname 0.0.0.0"
echo   [OK] Frontend started (port 3005)

echo.
echo ======================================
echo  All services started!
echo.
echo  Frontend: http://localhost:3005
echo  Backend:  http://localhost:8085
echo  API Doc:  http://localhost:8085/docs
echo ======================================
echo.
pause

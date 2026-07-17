@echo off
setlocal enabledelayedexpansion
title SpiritLens Stopper
cd /d "D:\SpiritLens"

echo [SpiritLens] Stopping all services...
echo.

:: Stop Backend (Uvicorn)
echo [1/5] Stopping Backend ...
for /f "tokens=2" %%a in ('tasklist /FI "WINDOWTITLE eq Backend" /NH 2^>nul') do taskkill /F /PID %%a >nul 2>&1
echo   [OK] Backend stopped

:: Stop Celery Worker
echo [2/5] Stopping Celery Worker ...
for /f "tokens=2" %%a in ('tasklist /FI "WINDOWTITLE eq Celery" /NH 2^>nul') do taskkill /F /PID %%a >nul 2>&1
echo   [OK] Celery Worker stopped

:: Stop Frontend
echo [3/5] Stopping Frontend ...
for /f "tokens=2" %%a in ('tasklist /FI "WINDOWTITLE eq Frontend" /NH 2^>nul') do taskkill /F /PID %%a >nul 2>&1
echo   [OK] Frontend stopped

:: Stop Redis
echo [4/5] Stopping Redis ...
"D:\tools\redis\redis-cli.exe" shutdown >nul 2>&1
echo   [OK] Redis stopped

:: Stop PostgreSQL
echo [5/5] Stopping PostgreSQL ...
"D:\tools\pgsql\bin\pg_ctl.exe" -D "D:\tools\pgsql\data" stop >nul 2>&1
echo   [OK] PostgreSQL stopped

echo.
echo ======================================
echo  All services stopped.
echo ======================================
timeout /t 2 /nobreak >nul

@echo off
setlocal enabledelayedexpansion
title GGCM OCMS - Restore databases and set up OCMS

REM ============================================================
REM  Run this ONCE, with MySQL already started from the XAMPP
REM  Control Panel. It restores the other project databases from
REM  the SQL dumps, then creates and seeds ggcm_ocms.
REM ============================================================

set "MYSQL=C:\xampp\mysql\bin\mysql.exe"
set "DUMPS=%USERPROFILE%\Downloads\mysql-dumps-recovered"
set "SERVER=%~dp0server"

echo.
echo  ================================================================
echo    GGCM OCMS  -  Restore databases
echo  ================================================================
echo.

if not exist "%MYSQL%" (
  echo  [X] Cannot find %MYSQL%
  echo      Edit this file and correct the MYSQL path.
  pause & exit /b 1
)

REM A port check is not enough: a half-started mysqld holds the port open while
REM refusing every connection. Prove the server answers a query instead.
echo  [1/4] Checking MySQL is actually serving...
"%MYSQL%" -u root -N -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo  [X] MySQL is not answering queries.
  echo.
  echo      Open the XAMPP Control Panel and press Start next to MySQL.
  echo      Wait until it turns green, then run this file again.
  pause & exit /b 1
)
echo   [OK] MySQL is serving

echo.
echo  [2/4] Restoring your other project databases...
if not exist "%DUMPS%" (
  echo   [!] No dumps folder at %DUMPS% - skipping this step.
) else (
  for %%F in ("%DUMPS%\*.sql") do (
    if /I not "%%~nF"=="ggcm_ocms" (
      echo    - %%~nF
      "%MYSQL%" -u root --force < "%%F" 2>nul
    )
  )
  echo   [OK] Project databases restored
)

echo.
echo  [3/4] Creating ggcm_ocms_v2 and seeding original dataset...
echo        (about 3,000 students - this takes a few minutes)
"%MYSQL%" -u root -e "DROP DATABASE IF EXISTS ggcm_ocms_v2; CREATE DATABASE ggcm_ocms_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

pushd "%~dp0server_node_backup"
call npx prisma db push
call node prisma\seed-generate.js
popd

echo.
echo  [4/4] Applying Laravel migrations...
pushd "%SERVER%"
call php artisan migrate --force
if errorlevel 1 (
  echo  [X] Laravel migration failed - see the messages above.
  popd & pause & exit /b 1
)
popd

echo.
echo  ================================================================
echo    Done. Start the system with SETUP_AND_RUN.bat
echo    Logins use the password:  password
echo  ================================================================
echo.
pause

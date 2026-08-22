@echo off
setlocal enabledelayedexpansion
title GGCM OCMS - Restore Database

echo.
echo  ================================================================
echo    GGCM OCMS  -  Restore Database
echo  ================================================================
echo.

set DB_NAME=ggcm_ocms_v2
set SQL_FILE=ggcm_ocms_v2_data.sql

echo Locating mysql.exe...
set MYSQL_CMD=mysql

:: Check if mysql is in PATH
mysql -V >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo mysql is not in PATH. Searching common XAMPP and Laragon locations...
    
    if exist "C:\xampp\mysql\bin\mysql.exe" (
        set "MYSQL_CMD=C:\xampp\mysql\bin\mysql.exe"
    ) else (
        :: Try to find Laragon's mysql
        for /d %%i in (C:\laragon\bin\mysql\*) do (
            if exist "%%i\bin\mysql.exe" (
                set "MYSQL_CMD=%%i\bin\mysql.exe"
                goto :found_mysql
            )
        )
        echo [ERROR] Could not find mysql.exe in PATH, XAMPP, or Laragon. 
        echo Please ensure your local server is running and mysql is accessible.
        pause
        exit /b 1
    )
)
:found_mysql

echo.
echo [1/2] Checking MySQL is actually serving...
"!MYSQL_CMD!" -u root -N -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo  [X] MySQL is not answering queries.
  echo.
  echo      Open your local server (XAMPP/Laragon) and Start MySQL.
  echo      Wait until it is running, then run this file again.
  pause & exit /b 1
)
echo  [OK] MySQL is serving

echo.
echo [2/2] Restoring complete database from dump...
echo       Dropping existing database if present...
"!MYSQL_CMD!" -u root -e "DROP DATABASE IF EXISTS %DB_NAME%; CREATE DATABASE %DB_NAME% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if exist "%~dp0%SQL_FILE%" (
    echo       Importing %SQL_FILE% (this may take a moment)...
    "!MYSQL_CMD!" -u root %DB_NAME% < "%~dp0%SQL_FILE%"
    echo  [OK] Database restored successfully!
) else (
    echo  [ERROR] %SQL_FILE% not found in the current directory!
)

echo.
echo  ================================================================
echo    Done. Start the system with SETUP_AND_RUN.bat
echo    Logins use the password:  password
echo  ================================================================
echo.
pause

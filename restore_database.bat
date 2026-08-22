@echo off
setlocal enabledelayedexpansion
set DB_NAME=ggcm_ocms_v2
set SQL_FILE=ggcm_ocms_v2_data.sql

echo Locating mysql.exe...
set MYSQL_CMD=mysql

:: Check if mysql is in PATH
mysql -V >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo mysql is not in PATH. Searching common XAMPP and Laragon locations...
    
    if exist "C:\xampp\mysql\bin\mysql.exe" (
        set MYSQL_CMD="C:\xampp\mysql\bin\mysql.exe"
    ) else (
        :: Try to find Laragon's mysql
        for /d %%i in (C:\laragon\bin\mysql\*) do (
            if exist "%%i\bin\mysql.exe" (
                set MYSQL_CMD="%%i\bin\mysql.exe"
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

echo Using MySQL command: !MYSQL_CMD!
echo Checking if database %DB_NAME% exists...

!MYSQL_CMD! -u root -e "USE %DB_NAME%;" 2>nul
if !ERRORLEVEL! equ 0 (
    echo Database %DB_NAME% already exists. Skipping auto-import.
) else (
    echo Database %DB_NAME% does not exist. Creating and importing data...
    !MYSQL_CMD! -u root -e "CREATE DATABASE %DB_NAME%;"
    if exist "%~dp0%SQL_FILE%" (
        !MYSQL_CMD! -u root %DB_NAME% < "%~dp0%SQL_FILE%"
        echo Import completed successfully!
    ) else (
        echo [ERROR] %SQL_FILE% not found in the current directory!
    )
)

pause

@echo off
set DB_NAME=ggcm_ocms_v2
set SQL_FILE=ggcm_ocms_v2_data.sql

echo Checking if database %DB_NAME% exists...

mysql -u root -e "USE %DB_NAME%;" 2>nul
if %ERRORLEVEL% equ 0 (
    echo Database %DB_NAME% already exists. Skipping auto-import.
) else (
    echo Database %DB_NAME% does not exist. Creating and importing data...
    mysql -u root -e "CREATE DATABASE %DB_NAME%;"
    if exist %SQL_FILE% (
        mysql -u root %DB_NAME% < %SQL_FILE%
        echo Import completed successfully!
    ) else (
        echo Error: %SQL_FILE% not found! Please make sure the SQL file is in the same directory.
    )
)

pause

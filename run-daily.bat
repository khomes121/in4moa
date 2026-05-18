@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo in4moa daily policy auto publish
echo.
call node scripts/daily-policy-local.mjs
echo.
echo Finished. Press any key to close.
pause

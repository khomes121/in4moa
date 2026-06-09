@echo off
rem Scheduled task version - no pause, output to logs\scheduler.log
chcp 65001 > nul
cd /d "%~dp0"
call node scripts\daily-policy-local.mjs >> logs\scheduler.log 2>&1

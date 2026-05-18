@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ============================================================
echo  in4moa daily policy - last run status
echo ============================================================
echo.
if exist "logs\_status.json" (
  type "logs\_status.json"
) else (
  echo No status yet. Run daily-policy first.
)
echo.
echo ============================================================
echo  Recent errors (last 20 lines)
echo ============================================================
echo.
if exist "logs\error.log" (
  powershell -NoProfile -Command "Get-Content -Path 'logs/error.log' -Tail 20 -Encoding UTF8"
) else (
  echo No errors.
)
echo.
echo ============================================================
echo  Latest log file
echo ============================================================
echo.
if exist "logs\latest.log" (
  for %%F in (logs\latest.log) do echo Size: %%~zF bytes / Modified: %%~tF
) else (
  echo No latest.log
)
echo.
pause

@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ============================================================
echo  in4moa daily policy - log monitor (tail -f mode)
echo  Press Ctrl+C to stop
echo ============================================================
echo.
if not exist "logs\latest.log" (
  echo No logs yet. Run daily-policy first.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -Command "Get-Content -Path 'logs/latest.log' -Wait -Tail 50 -Encoding UTF8"

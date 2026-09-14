@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0install-task.ps1""'"
if errorlevel 1 (
  echo Kurulum tamamlanamadi.
) else (
  echo Vega e-Fatura export gorevi hazir.
)
pause

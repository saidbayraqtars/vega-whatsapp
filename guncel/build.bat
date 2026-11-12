@echo off
REM ─── Vega WhatsApp — masaustu kurulum dosyasi olustur (Electron installer) ───
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist server\node_modules (
    cd server
    call npm install
    cd ..
)
echo.
echo Kurulum dosyasi olusturuluyor (dist\ altinda .exe setup)...
call npm run dist
echo.
echo TAMAM. Kurulum: dist\Vega WhatsApp Setup *.exe
pause

@echo off
REM ─── Vega WhatsApp — masaustu uygulamasini calistir (Electron) ───
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if not exist node_modules (
    echo Ilk calistirma: Electron kuruluyor...
    call npm install
)
if not exist server\node_modules (
    echo Sunucu bagimliliklari kuruluyor...
    cd server
    call npm install
    cd ..
)
echo.
echo Vega WhatsApp baslatiliyor...
call npm start

@echo off
REM --- Vega WhatsApp LEGACY (Win7/2008 R2/2012): yeni surum yayinla (GitHub Releases uzerinden oto-guncelleme) ---
REM Kullanim: release.bat            (patch surum artar: 1.0.0 -> 1.0.1)
REM          release.bat minor      (1.0.0 -> 1.1.0)
REM          release.bat none       (surum degismez, ayni surumu tekrar dener)
cd /d "%~dp0"
if not exist node_modules call npm install
node scripts\release.js %1
pause

@echo off
echo ========================================================
echo        Starting Parakeet AI Desktop Application
echo ========================================================
echo.
cd /d "%~dp0desktop"
npm run electron:dev

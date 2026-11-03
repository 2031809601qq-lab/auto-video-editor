@echo off
chcp 65001 >nul
cd /d "%~dp0."
node "%~dp0.\工具\手机互传\server.js"
pause

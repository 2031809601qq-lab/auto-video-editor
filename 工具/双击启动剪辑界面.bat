@echo off
chcp 65001 >nul
cd /d "%~dp0."
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0.\FFmpeg话题剪辑GUI.ps1" 1> "%~dp0.\启动日志.txt" 2>&1
if errorlevel 1 (
  echo GUI failed to start. See startup log.
  pause
)

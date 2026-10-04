@echo off
title Installation du service OpenCode Daemon (SYSTEM)
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c \"%~s0\"'"
    exit /b
)

:: Supprimer l'ancien service s'il existe
sc.exe delete OpenCodeDaemon >nul 2>&1
timeout /t 2 /nobreak >nul

:: Installer comme tâche SYSTEM (équivalent service mais sans les contraintes SCM)
schtasks /Create /SC ONSTART /TN OpenCodeDaemon /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\jeanluc\opencode-fork\scripts\daemon-service-wrapper.ps1\"" /RL HIGHEST /RU SYSTEM /F

:: Démarrer maintenant
schtasks /Run /TN OpenCodeDaemon

echo.
echo ========================================
echo  Installation réussie !
echo  Le daemon tourne en arrière-plan.
echo ========================================
echo.
echo Commandes :
echo   Demarrer : schtasks /Run /TN OpenCodeDaemon
echo   Arreter  : schtasks /End /TN OpenCodeDaemon
echo   Status   : schtasks /Query /TN OpenCodeDaemon
echo   Logs     : %LOCALAPPDATA%\opencode\logs\daemon-*.log
echo.
pause

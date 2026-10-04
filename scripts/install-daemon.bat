@echo off
title Installation du service OpenCode Daemon
echo ========================================
echo  Installation du service OpenCode Daemon
echo ========================================
echo.

:: Vérifier les droits admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Demande d'elevation admin...
    powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c \"%~s0\"'"
    exit /b
)

echo [1/3] Verification du binaire...
if not exist "C:\jeanluc\opencode-fork\dist\bin\opencode.exe" (
    echo ERREUR: Binaire introuvable
    pause
    exit /b 1
)

echo [2/3] Creation du service...
sc.exe create OpenCodeDaemon binPath="\"C:\jeanluc\opencode-fork\dist\bin\opencode.exe\" watch --daemon" start=auto DisplayName="OpenCode Daemon"
sc.exe description OpenCodeDaemon "OpenCode Daemon — Background agent for webhook processing, memory consolidation, and tunnel health monitoring"
sc.exe failure OpenCodeDaemon reset=86400 actions=restart/60000/restart/120000/restart/300000

echo [3/3] Demarrage du service...
sc.exe start OpenCodeDaemon

echo.
echo ========================================
echo  Service installe et demarre !
echo ========================================
echo.
echo Commandes :
echo   Start-Service -Name OpenCodeDaemon
echo   Stop-Service  -Name OpenCodeDaemon
echo   Get-Service   -Name OpenCodeDaemon
echo.
pause

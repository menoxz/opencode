# install-service.ps1
# Script d'installation du service Windows OpenCodeDaemon

$serviceName = "OpenCodeDaemon"
$binaryPath = "C:\jeanluc\opencode-fork\dist\bin\opencode.exe"
$arguments = "watch --daemon"
$displayName = "OpenCode Daemon"
$description = "OpenCode Daemon — Background agent for webhook processing, memory consolidation, and tunnel health monitoring"

# Vérifier que le binaire existe
if (-not (Test-Path $binaryPath)) {
    Write-Error "Binary not found at $binaryPath"
    exit 1
}

# Vérifier si le service existe déjà
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existing) {
    Write-Host "Service $serviceName already exists. Stopping and removing..."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $serviceName
    Start-Sleep -Seconds 2
}

# Créer le service
Write-Host "Creating service $serviceName..."
New-Service -Name $serviceName `
    -BinaryPathName "`"$binaryPath`" $arguments" `
    -DisplayName $displayName `
    -Description $description `
    -StartupType Automatic

# Configurer les actions de récupération (restart après 1 min puis 2 min)
sc.exe failure $serviceName reset=86400 actions=restart/60000/restart/120000/restart/300000

Write-Host "✅ Service $serviceName created and configured"
Write-Host ""
Write-Host "Démarrer le service : Start-Service -Name $serviceName"
Write-Host "Arrêter le service  : Stop-Service -Name $serviceName"
Write-Host "Voir les logs        : Get-EventLog -LogName Application -Source OpenCodeDaemon"

# uninstall-service.ps1
# Script de désinstallation du service Windows OpenCodeDaemon

$serviceName = "OpenCodeDaemon"
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existing) {
    Write-Host "Stopping and removing service $serviceName..."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $serviceName
    Write-Host "✅ Service $serviceName removed"
} else {
    Write-Host "Service $serviceName not found"
}

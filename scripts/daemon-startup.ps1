# daemon-startup.ps1
# Script de démarrage global — à ajouter au Startup Windows
# Démarre le daemon trigger + les tunnels

Write-Host "🧠 OpenCode Infrastructure Startup"
Write-Host "=================================="

# 1. Vérifier que le daemon trigger tourne
$triggerHealth = try { 
    $r = Invoke-RestMethod "http://localhost:8645/health" -TimeoutSec 3
    $r.status -eq "ok"
} catch { $false }

if (-not $triggerHealth) {
    Write-Host "⚠️ Trigger daemon not running. Check daemon service."
    Write-Host "   Run: Start-Service -Name OpenCodeDaemon"
} else {
    Write-Host "✅ Trigger daemon: UP"
}

# 2. Vérifier la mémoire
$memoryHealth = try {
    $r = Invoke-RestMethod "http://localhost:8765/api/v1/health" -TimeoutSec 3
    $r.status -eq "ok"
} catch { $false }

if ($memoryHealth) {
    Write-Host "✅ Memory API: UP"
} else {
    Write-Host "ℹ️  Memory API: not available (using native SQLite)"
}

Write-Host ""
Write-Host "📡 Tunnel status: check with tunnel-stabilizer.ps1 -Action status"

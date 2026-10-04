# tunnel-stabilizer.ps1
# Surveille les tunnels trycloudflare et met à jour les configurations
# qui dépendent de l'URL (webhooks, etc.)

param(
    [string]$Action = "status",  # status, check, update, watch
    [string]$TunnelName = "cf-trigger"
)

$logDir = "$env:LOCALAPPDATA\opencode\logs"
$tunnelStateFile = "$env:LOCALAPPDATA\opencode\tunnel-state.json"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Get-TunnelUrl {
    param([string]$Name)
    # Essayer de lire l'URL depuis la sortie du terminal
    # On peut aussi vérifier via health endpoint
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8645/health" -TimeoutSec 5
        return $null  # trycloudflare URL n'est pas dans le health check
    } catch {
        return $null
    }
}

function Get-LastKnownUrl {
    if (Test-Path $tunnelStateFile) {
        $state = Get-Content $tunnelStateFile | ConvertFrom-Json
        return $state.url
    }
    return $null
}

function Save-TunnelUrl {
    param([string]$Url)
    $state = @{
        url = $Url
        lastChecked = (Get-Date -Format "o")
        lastChange = (Get-Date -Format "o")
    }
    $state | ConvertTo-Json | Set-Content $tunnelStateFile
}

function Test-TunnelHealth {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8645/health" -TimeoutSec 5
        return $response.status -eq "ok"
    } catch {
        return $false
    }
}

function Watch-Tunnels {
    Write-Host "🧠 Tunnel Stabilizer — watching for changes..."
    Write-Host "   Press Ctrl+C to stop"
    
    while ($true) {
        $healthy = Test-TunnelHealth
        
        if (-not $healthy) {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Write-Host "[$timestamp] ⚠️ Tunnel unhealthy! Trigger daemon may be down."
            "$timestamp WARN Tunnel unhealthy" | Out-File -FilePath "$logDir\tunnel-watch.log" -Append
        } else {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Write-Host "[$timestamp] ✅ Tunnel healthy"
        }
        
        Start-Sleep -Seconds 30
    }
}

switch ($Action) {
    "status" {
        $healthy = Test-TunnelHealth
        $lastUrl = Get-LastKnownUrl
        
        Write-Host "=== Tunnel Status ==="
        Write-Host "Trigger Daemon : $(if ($healthy) { '✅ UP' } else { '❌ DOWN' })"
        Write-Host "Last known URL : $(if ($lastUrl) { $lastUrl } else { 'Never recorded' })"
        Write-Host "Health endpoint: http://localhost:8645/health"
    }
    
    "check" {
        $healthy = Test-TunnelHealth
        if ($healthy) {
            Write-Host "✅ Trigger daemon is healthy"
            exit 0
        } else {
            Write-Host "❌ Trigger daemon is DOWN"
            exit 1
        }
    }
    
    "watch" {
        Watch-Tunnels
    }
    
    default {
        Write-Host "Usage: tunnel-stabilizer.ps1 [-Action status|check|watch]"
        Write-Host "  status  — Show current tunnel status"
        Write-Host "  check   — Quick health check (exit code)"
        Write-Host "  watch   — Continuous monitoring"
    }
}

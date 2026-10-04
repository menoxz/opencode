# daemon-wrapper.ps1
# Wrapper qui lance le daemon avec redirection des logs
param()

$logDir = "$env:LOCALAPPDATA\opencode\logs"
$logFile = Join-Path $logDir "daemon-$(Get-Date -Format 'yyyy-MM-dd').log"

# Créer le dossier de logs
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Lancer le daemon avec logging
$binary = "C:\jeanluc\opencode-fork\dist\bin\opencode.exe"
$date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$date] Starting OpenCode Daemon..." | Out-File -FilePath $logFile -Append

try {
    & $binary watch --daemon 2>&1 | ForEach-Object {
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $_" | Out-File -FilePath $logFile -Append
    }
}
catch {
    $errorMsg = "CRASH: $_"
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $errorMsg" | Out-File -FilePath $logFile -Append
    exit 1
}

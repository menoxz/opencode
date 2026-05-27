# OpenCode Daemon Service Wrapper
# Lancé par le Task Scheduler au démarrage de Windows
param()

$logDir = "$env:LOCALAPPDATA\opencode\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$logFile = Join-Path $logDir "daemon-2026-05-26.log"
$binary = "C:\jeanluc\opencode-fork\dist\bin\opencode.exe"

"[2026-05-26 18:14:52] OpenCode Daemon starting..." | Out-File $logFile -Append

while ($true) {
    try {
        & $binary watch --daemon 2>&1 | ForEach-Object {
            "2026-05-26 18:14:52 " | Out-File $logFile -Append
        }
    }
    catch {
        "CRASH:  at 05/26/2026 18:14:52" | Out-File $logFile -Append
    }
    "RESTART: Daemon crashed, restarting in 5s at 05/26/2026 18:14:52" | Out-File $logFile -Append
    Start-Sleep -Seconds 5
}

# OpenCode Daemon — User-level startup wrapper
# Lancé automatiquement au login Windows via le dossier Startup

$logDir = "$env:LOCALAPPDATA\opencode\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$logFile = Join-Path $logDir "daemon-$(Get-Date -Format 'yyyy-MM-dd').log"
$binary = "C:\jeanluc\opencode-fork\dist\bin\opencode.exe"

# Attendre que le réseau et le système soient prêts
Start-Sleep -Seconds 10

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] OpenCode Daemon starting..." | Out-File $logFile -Append

try {
    # Run once per Windows login. An explicit `opencodev2 daemon stop` must
    # remain authoritative: when the daemon exits, this wrapper exits too and
    # never resurrects autonomous work behind a closed TUI.
    $p = Start-Process -FilePath $binary -ArgumentList "watch", "--daemon" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\opencode-daemon-out.log" -RedirectStandardError "$env:TEMP\opencode-daemon-err.log" -PassThru -Wait
    $exitCode = $p.ExitCode
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Daemon exited with code $exitCode; wrapper stopping" | Out-File $logFile -Append
}
catch {
    "CRASH at $(Get-Date): $_" | Out-File $logFile -Append
}

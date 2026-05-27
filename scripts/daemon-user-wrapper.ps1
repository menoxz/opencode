# OpenCode Daemon — User-level startup wrapper
# Lancé automatiquement au login Windows via le dossier Startup

$logDir = "$env:LOCALAPPDATA\opencode\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$logFile = Join-Path $logDir "daemon-$(Get-Date -Format 'yyyy-MM-dd').log"
$binary = "C:\jeanluc\opencode-fork\dist\bin\opencode.exe"

# Attendre que le réseau et le système soient prêts
Start-Sleep -Seconds 10

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] OpenCode Daemon starting..." | Out-File $logFile -Append

while ($true) {
    try {
        # IMPORTANT: Start-Process -Wait est utilisé au lieu du pipeline
        # pour éviter que le script ne se termine quand le daemon
        # n'écrit rien sur stdout.
        $p = Start-Process -FilePath $binary -ArgumentList "watch", "--daemon" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\opencode-daemon-out.log" -RedirectStandardError "$env:TEMP\opencode-daemon-err.log" -PassThru -Wait
        $exitCode = $p.ExitCode
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Daemon exited with code $exitCode" | Out-File $logFile -Append
    }
    catch {
        "CRASH at $(Get-Date): $_" | Out-File $logFile -Append
    }
    "RESTART at $(Get-Date), restarting in 5s..." | Out-File $logFile -Append
    Start-Sleep -Seconds 5
}

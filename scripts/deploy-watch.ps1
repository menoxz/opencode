# deploy-watch.ps1 — Automatic binary swap on opencode exit
# Runs as a background job, survives the parent process.
# When opencode.exe exits, replaces it with the new version.

param(
    [string]$NewBinary = "C:\jeanluc\opencode-fork\dist\bin\opencode.exe",
    [string]$TargetDir = "$env:USERPROFILE\.opencode-fork\bin",
    [string]$TargetExe = "opencode.exe",
    [string]$BackupSuffix = ".old.exe"
)

$targetPath = Join-Path $TargetDir $TargetExe
$backupPath = Join-Path $TargetDir "${TargetExe}${BackupSuffix}"

# Create a marker file so the user knows deployment is pending
$markerPath = Join-Path $TargetDir ".deploy-pending"
"Deploying $NewBinary -> $targetPath after opencode exits" | Out-File -LiteralPath $markerPath -Encoding utf8

Write-Host "🔍 Watching for opencode.exe to exit..."
Write-Host "   Will deploy: $NewBinary"
Write-Host "   To: $targetPath"
Write-Host "   Marker: $markerPath"

# Poll until ALL opencode processes are gone
do {
    $procs = Get-Process -Name "opencode" -ErrorAction SilentlyContinue
    if ($procs) {
        $pids = ($procs | ForEach-Object { $_.Id }) -join ", "
        Write-Host "⏳ opencode still running (PID: $pids)... waiting 5s"
        Start-Sleep -Seconds 5
    }
} while ($procs)

# Process exited — brief grace period for file release
Write-Host "⚡ opencode exited. Waiting 3s for file release..."
Start-Sleep -Seconds 3

# Backup old binary
if (Test-Path $targetPath) {
    Write-Host "📦 Backing up $targetPath -> $backupPath"
    Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
}

# Deploy new binary
Write-Host "🚀 Deploying $NewBinary -> $targetPath"
Copy-Item -LiteralPath $NewBinary -Destination $targetPath -Force

# Verify
$v = & $targetPath --version 2>$null
if ($v) {
    Write-Host "✅ SUCCESS: Deployed $v"
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "❌ FAILED: New binary won't run"
    "FAILED at $(Get-Date)" | Out-File -LiteralPath $markerPath -Encoding utf8 -Append
}

Write-Host "🏁 Deploy watch completed. You may close this window."
Start-Sleep -Seconds 10

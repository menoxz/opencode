# build-versioned.ps1
# Build opencode avec une version explicite.
# Usage: .\scripts\build-versioned.ps1 -Version "1.16.05"
#
# Le script refuse de builder sans -Version.
# La version est encodée dans le binaire et visible via --version.
# Après le build : purge les vieux binaires, sync les wrappers, smoke test complet.

param(
  [Parameter(Mandatory = $true, HelpMessage = "Version MUST be specified (e.g. 1.16.05)")]
  [string]$Version
)

# Valide que la version n'est pas vide et ne ressemble pas à un timestamp dev
if (-not $Version -or $Version -like "0.0.0-dev*") {
  Write-Error "BUILD BLOCKED: Version invalide ou manquante."
  Write-Error "Usage: .\scripts\build-versioned.ps1 -Version ""1.16.05"""
  exit 1
}

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$pkgDir = Join-Path $repoRoot "packages\opencode"
$distBin = Join-Path $repoRoot "dist\bin"

Write-Host "🔨 Building opencode v$Version..." -ForegroundColor Cyan
Write-Host "   Repo: $repoRoot"
Write-Host "   Pkg:  $pkgDir"
Write-Host ""

# Définir la version dans l'environnement et builder
$env:OPENCODE_VERSION = $Version

Push-Location $pkgDir
try {
  bun run build
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
  Remove-Item Env:\OPENCODE_VERSION -ErrorAction SilentlyContinue
}

# ── Smoke test ──────────────────────────────────────────────
$binary = Join-Path $distBin "opencode.exe"
if (-not (Test-Path $binary)) {
  Write-Warning "Build terminé mais binaire introuvable : $binary"
  exit 1
}

$builtVersion = & $binary --version
Write-Host ""
Write-Host "✅ Build : $builtVersion" -ForegroundColor Green

# Vérification opencode debug info
$debugInfo = & $binary debug info 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ debug info OK" -ForegroundColor Green
} else {
  Write-Warning "debug info a échoué (exit $LASTEXITCODE)"
}

# ── Purge des vieux binaires ───────────────────────────────
# On garde : opencode.exe (courant), opencode.old.exe (backup)
# On supprime : opencode.prev*.exe, opencode.current.old.exe
Get-ChildItem $distBin -Filter "opencode.prev*.exe" | ForEach-Object {
  Remove-Item $_.FullName -Force
  Write-Host "🗑️  Purge : $($_.Name)" -ForegroundColor DarkGray
}
# Nettoie aussi les résidus de synchro si présent
$oldCurrent = Join-Path $distBin "opencode.current.old.exe"
if (Test-Path $oldCurrent) {
  Remove-Item $oldCurrent -Force
  Write-Host "🗑️  Purge : opencode.current.old.exe" -ForegroundColor DarkGray
}

# ── Sync opencode.current.exe (pour wrappers qui y pointent) ─
$currentBin = Join-Path $distBin "opencode.current.exe"
try {
  # Renommer d'abord (rename fonctionne même si le fichier est locké)
  Rename-Item $currentBin "opencode.current.old.exe" -ErrorAction SilentlyContinue
  Copy-Item $binary $currentBin
  Remove-Item (Join-Path $distBin "opencode.current.old.exe") -Force -ErrorAction SilentlyContinue
  Write-Host "✅ opencode.current.exe synchronisé" -ForegroundColor Green
} catch {
  Write-Warning "Sync opencode.current.exe impossible (peut-être locké) : $_"
}

Write-Host ""
Write-Host "📦 Binaires dans $distBin :" -ForegroundColor Cyan
Get-ChildItem $distBin -Filter "opencode*.exe" | ForEach-Object {
  $sizeMB = [math]::Round($_.Length / 1MB, 1)
  Write-Host "   $($_.Name) : ${sizeMB}MB"
}

# build-versioned.ps1
# Build opencode avec une version explicite.
# Usage: .\scripts\build-versioned.ps1 -Version "1.16.05"
#
# Le script refuse de builder sans -Version.
# La version est encodée dans le binaire et visible via --version.

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

# Smoke test
$binary = Join-Path $repoRoot "dist\bin\opencode.exe"
if (Test-Path $binary) {
  $builtVersion = & $binary --version
  Write-Host ""
  Write-Host "✅ Build terminé : $builtVersion" -ForegroundColor Green
} else {
  Write-Warning "Build terminé mais binaire introuvable : $binary"
}

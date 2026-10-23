# Verifie que la commande `opencodev2` nue resout bien le binaire deploye.
#
# Raison d'etre : PowerShell resout `.ps1` AVANT `.exe` dans le PATH. Un
# `npm install -g` recree `%APPDATA%\npm\opencodev2.ps1` en le faisant pointer vers
# `node_modules/.../opencodev2.mjs`, donc la commande nue annonce une vieille version
# alors que le binaire deploye est a jour. Constate trois fois : 2.4.3, 2.4.21, 2.4.17.
#
# Sortie : LAUNCHER-OK (exit 0) ou LAUNCHER-STALE / EXE-DESYNC (exit 1).

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$pkgPath = Join-Path $root "packages\opencode\package.json"
if (-not (Test-Path -LiteralPath $pkgPath)) {
  Write-Output "PKG-ABSENT: $pkgPath"
  exit 1
}
$pkg = (Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json).version

# La sortie peut inclure une ligne de diagnostic precedant la version
# (« binaire de plateforme absent, resolution… 2.4.17 ») : on prend le DERNIER
# triplet semantique rencontre, qui est la version effective.
function Get-Version([string[]] $lines) {
  $text = ($lines -join "`n")
  $matches = [regex]::Matches($text, '\d+\.\d+\.\d+')
  if ($matches.Count -eq 0) { return $null }
  return $matches[$matches.Count - 1].Value
}

$bareRaw = & opencodev2 --version 2>&1
$bare = Get-Version $bareRaw

$exePath = Join-Path $env:APPDATA "npm\opencodev2.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
  Write-Output "EXE-ABSENT: $exePath"
  exit 1
}
$exe = Get-Version (& $exePath --version 2>&1)

Write-Output "pkg=$pkg bare=$bare exe=$exe"

if ($null -eq $exe -or $exe -ne $pkg) {
  Write-Output "EXE-DESYNC: binaire '$exe', depot '$pkg' — rebuild et redeploiement requis"
  exit 1
}
if ($null -eq $bare -or $bare -ne $pkg) {
  Write-Output "LAUNCHER-STALE: le shim resout '$bare' au lieu de '$pkg'"
  Write-Output "  cause probable : npm install -g a reecrit opencodev2.ps1 vers node_modules"
  Write-Output "  correctif : renommer les 3 shims en .stale-<version>-<ts>.bak puis recreer des lanceurs vers opencodev2.exe"
  exit 1
}

Write-Output "LAUNCHER-OK"
exit 0

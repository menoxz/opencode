# opencode fork installer — GitHub Releases
# Usage: powershell -c "irm https://raw.githubusercontent.com/menoxz/opencode/dev/scripts/install.ps1 | iex"
# Or:   scripts/install.ps1

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\opencode\bin"
)

$Repo = "menoxz/opencode"
$App = "opencode"

# --- detect platform ---
$Arch = "x64"
if ([Environment]::Is64BitOperatingSystem -eq $false) {
    Write-Error "32-bit systems are not supported"
    exit 1
}

$Target = "win-$Arch"

# --- resolve version ---
if ($Version -eq "latest") {
    Write-Host "Fetching latest release..."
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -ErrorAction Stop
    $VersionTag = $release.tag_name
    $asset = $release.assets | Where-Object { $_.name -like "*$Target*" }
} else {
    $VersionTag = $Version
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/tags/$Version" -ErrorAction Stop
    $asset = $release.assets | Where-Object { $_.name -like "*$Target*" }
}

if (-not $asset) {
    Write-Error "No release asset found for $Target"
    exit 1
}

$DownloadUrl = $asset.browser_download_url
$BinaryName = $asset.name

# --- download ---
Write-Host "Downloading $App $VersionTag ($Target)..."
New-Item -ItemType Directory -Path $InstallDir -Force -ErrorAction SilentlyContinue | Out-Null
$OutPath = Join-Path $InstallDir "$App.exe"

$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $DownloadUrl -OutFile $OutPath -UseBasicParsing

Write-Host ""
Write-Host "✅ $App $VersionTag installed to $OutPath"
Write-Host ""
Write-Host "Add to PATH (current session):  `$env:Path = `"$InstallDir;`$env:Path`""
Write-Host "Add to PATH (permanent):        [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';$InstallDir', 'User')"
Write-Host ""
Write-Host "Run:  & '$OutPath' --version"

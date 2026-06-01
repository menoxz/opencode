<#
.SYNOPSIS
    Import GitHub Copilot token from Windows Credential Manager into opencode auth.json
.DESCRIPTION
    Extracts the GitHub OAuth token stored by Git Credential Manager (git:https://github.com),
    verifies it works with the GitHub Copilot API, and saves it to opencode's auth.json.
    This allows opencode/gema to use your existing VS Code Copilot subscription without
    going through the OAuth device flow manually.
#>

$ErrorActionPreference = "Stop"

# ── Win32 Credential Reader (P/Invoke) ──────────────────────────────────────
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WinCred {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr credential);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIALW {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static string ReadCredential(string targetName) {
        IntPtr ptr;
        if (!CredRead(targetName, 1, 0, out ptr)) {
            int err = Marshal.GetLastWin32Error();
            throw new System.ComponentModel.Win32Exception(err, $"Failed to read credential '{targetName}' (error {err})");
        }

        try {
            CREDENTIALW cred = Marshal.PtrToStructure<CREDENTIALW>(ptr);
            byte[] blob = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, blob, 0, cred.CredentialBlobSize);
            return Encoding.Unicode.GetString(blob).TrimEnd('\0');
        } finally {
            CredFree(ptr);
        }
    }
}
"@

# ── Helper: colored output ──────────────────────────────────────────────────
function Write-Step($msg)  { Write-Host "▶ $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Error($msg) { Write-Host "✗ $msg" -ForegroundColor Red }
function Write-Warn($msg)  { Write-Host "⚠ $msg" -ForegroundColor Yellow }

# ── Main ────────────────────────────────────────────────────────────────────
Write-Step "🔍 Reading GitHub token from Windows Credential Manager..."

try {
    $token = [WinCred]::ReadCredential("git:https://github.com")
    Write-OK "Token found! Length: $($token.Length) chars, prefix: $($token.Substring(0, 4))..."
} catch {
    Write-Error $_.Exception.Message
    Write-Warn "Could not read git:https://github.com credential."
    Write-Warn "Make sure you have authenticated with GitHub via Git (git push/clone) or VS Code."
    exit 1
}

# ── Verify token against Copilot API ────────────────────────────────────────
Write-Step "🔍 Testing token against GitHub Copilot API..."

try {
    $response = Invoke-WebRequest -Uri "https://api.githubcopilot.com/models" `
        -Headers @{
            Authorization = "Bearer $token"
            "User-Agent"  = "opencode/1.18.7"
        } `
        -Method GET -UseBasicParsing -TimeoutSec 10

    if ($response.StatusCode -eq 200) {
        Write-OK "Token is valid! User has GitHub Copilot access."
    } else {
        Write-Error "Unexpected status: $($response.StatusCode)"
        exit 1
    }
} catch {
    Write-Error "Copilot API test failed: $($_.Exception.Message)"
    Write-Warn "The token does not have access to GitHub Copilot."
    Write-Warn "Make sure your GitHub account has an active Copilot subscription."
    exit 1
}

# ── Find opencode auth.json ─────────────────────────────────────────────────
Write-Step "🔍 Locating opencode auth.json..."

# opencode uses XDG data home: ~/.local/share/opencode on Linux/Mac,
# or %APPDATA%/opencode on Windows (via the `xdg-basedir` package)
$possiblePaths = @(
    "$env:LOCALAPPDATA\opencode\auth.json",
    "$env:APPDATA\opencode\auth.json",
    "$env:USERPROFILE\.local\share\opencode\auth.json"
)

$authPath = $null
foreach ($p in $possiblePaths) {
    if (Test-Path $p) {
        $authPath = $p
        break
    }
}

if (-not $authPath) {
    # Default to XDG path on Windows (opencode uses Global.Path.data)
    $authPath = "$env:LOCALAPPDATA\opencode\auth.json"
    Write-Warn "No existing auth.json found, will create at: $authPath"
} else {
    Write-OK "Found auth.json at: $authPath"
}

# ── Save token to auth.json ─────────────────────────────────────────────────
Write-Step "💾 Saving GitHub Copilot token to auth.json..."

$auth = @{}
if (Test-Path $authPath) {
    try {
        $auth = Get-Content $authPath -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable
    } catch {
        Write-Warn "Could not parse existing auth.json, starting fresh."
        $auth = @{}
    }
}

# Add github-copilot as an oauth credential (same format as opencode's OAuth device flow)
$auth["github-copilot"] = @{
    type    = "oauth"
    refresh = $token
    access  = $token
    expires = 0
}

# Preserve any existing entries
$json = $auth | ConvertTo-Json -Depth 10

# Ensure directory exists
$dir = Split-Path $authPath -Parent
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

Set-Content -Path $authPath -Value $json -Encoding UTF8 -NoNewline
Write-OK "Saved to $authPath"

# ── Final verification ──────────────────────────────────────────────────────
Write-Step "🔍 Verifying auth.json..."
$verify = Get-Content $authPath -Raw -Encoding UTF8 | ConvertFrom-Json
$copilot = $verify."github-copilot"
if ($copilot -and $copilot.type -eq "oauth" -and $copilot.refresh) {
    Write-OK "github-copilot credential is configured!"
    Write-OK "Type: $($copilot.type)"
    Write-OK "Token: $($copilot.refresh.Substring(0, 10))..."
    Write-OK "Expires: $($copilot.expires)"
} else {
    Write-Error "Verification failed - credential not found in auth.json"
    exit 1
}

Write-Host ""
Write-Host "✅ SUCCESS! GitHub Copilot is now linked to opencode." -ForegroundColor Green
Write-Host ""
Write-Host "Run 'opencode auth list' to verify, or just start using opencode with Copilot!" -ForegroundColor Cyan

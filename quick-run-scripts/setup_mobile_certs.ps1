param(
    [string]$DevicePath = "/sdcard/Download/rootCA.pem"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")

Set-Location $RepoRoot

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Assert-Command "mkcert"
Assert-Command "adb"

$mkcertRoot = mkcert -CAROOT
$mkcertCa = Join-Path $mkcertRoot "rootCA.pem"
if (-not (Test-Path $mkcertCa)) {
    throw "mkcert root CA not found at $mkcertCa"
}

$androidRawDir = Join-Path $RepoRoot "mobile\src\android\app\src\debug\res\raw"
$androidRawCa = Join-Path $androidRawDir "rootca.pem"
New-Item -ItemType Directory -Force -Path $androidRawDir | Out-Null
Copy-Item -Path $mkcertCa -Destination $androidRawCa -Force

$securityCertDir = Join-Path $RepoRoot "security\Containers\certs"
$securityCa = Join-Path $securityCertDir "rootCA.pem"
if (-not (Test-Path $securityCa)) {
    New-Item -ItemType Directory -Force -Path $securityCertDir | Out-Null
    Copy-Item -Path $mkcertCa -Destination $securityCa -Force
}

$adbDevices = adb devices
if (-not ($adbDevices -match "\tdevice")) {

    throw "No connected Android device/emulator found. Start one, then rerun."
}

adb reverse tcp:8443 tcp:8443 | Out-Null
adb reverse tcp:3000 tcp:3000 | Out-Null
adb push $securityCa $DevicePath | Out-Null

Write-Host "Mobile cert setup completed." -ForegroundColor Green
Write-Host "Copied for app trust config: $androidRawCa"
Write-Host "Pushed to device: $DevicePath"
Write-Host "Reminder: install the CA certificate on the device from Settings -> Security -> Install certificate (CA)."

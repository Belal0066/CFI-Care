$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

Write-Host "Starting container launcher (PowerShell-native)..."

# PUBLIC_HOSTNAME fallback (first non-loopback IPv4)
if (-not $env:PUBLIC_HOSTNAME) {
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
           Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
           Select-Object -ExpandProperty IPAddress -First 1)
  } catch {
    $ip = '127.0.0.1'
  }
  $env:PUBLIC_HOSTNAME = $ip
}
Write-Host "PUBLIC_HOSTNAME=$env:PUBLIC_HOSTNAME"

# Simple template substitution for ${PUBLIC_HOSTNAME}
function Replace-Template($inFile, $outFile) {
  if (Test-Path $inFile) {
    (Get-Content $inFile -Raw) -replace '\$\{PUBLIC_HOSTNAME\}',$env:PUBLIC_HOSTNAME | Set-Content $outFile
    Write-Host "Generated $outFile"
  }
}
Replace-Template (Join-Path $RepoRoot 'security/Containers/import/realm.template.json') (Join-Path $RepoRoot 'security/Containers/import/realm.json')
Replace-Template (Join-Path $RepoRoot 'mobile/src/lib/config/app_config.template.dart') (Join-Path $RepoRoot 'mobile/src/lib/config/app_config.generated.dart')
Replace-Template (Join-Path $RepoRoot 'frontend/src/src/environments/environment.template.ts') (Join-Path $RepoRoot 'frontend/src/src/environments/environment.ts')

# Jar detection (handle version suffixes)
$verifyDir = Join-Path $RepoRoot 'security/Containers/services/keycloak/verify-email/target'
$fhirDir   = Join-Path $RepoRoot 'security/Containers/services/keycloak/fhir-listener/target'

$verifyJar = Get-ChildItem -Path $verifyDir -Filter 'keycloak-emailveri-extensions*.jar' -File -ErrorAction SilentlyContinue | Select-Object -First 1
$fhirJar   = Get-ChildItem -Path $fhirDir -Filter 'keycloak-fhir-listener*.jar' -File -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $verifyJar -or -not $fhirJar) {
  Write-Host "Keycloak jars missing; running Init-system.ps1..."
  $initPs = Join-Path $ScriptDir 'Init-system.ps1'
  if (Test-Path $initPs) {
    & $initPs
  } else {
    if (Test-Path (Join-Path $ScriptDir 'Init-system.sh')) {
      wsl.exe bash -lc "cd '$RepoRoot' && ./quick-run-scripts/Init-system.sh"
    } else {
      throw "Init-system not found."
    }
  }
} else {
  Write-Host "Found jars: $($verifyJar.Name), $($fhirJar.Name)"
}

# 1. Get current directory (original behavior)
$Dir = $PWD.Path
Write-Host "Current directory: $Dir"
# 2. Launch tabs
#    We added "-ExecutionPolicy Bypass" to every line.
#    This allows the script to run without changing your global PC settings.

wt.exe -w 0 `
    nt --title "Keycloak" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_kc_containers.ps1" `; `
    nt --title "Nginx"    -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_nginx_containers.ps1" `; `
    nt --title "FHIR"     -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_fhir_container.ps1" `; `
    nt --title "Frontend" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_frontend.ps1" `; `
    nt --title "NodeJS"   -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_nodejs_containers.ps1"
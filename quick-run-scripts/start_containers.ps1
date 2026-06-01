$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

Write-Host "Starting container launcher (PowerShell-native)..."

# LOCAL_HOSTNAME fallback (first non-loopback IPv4)
if (-not $env:LOCAL_HOSTNAME) {
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
      Select-Object -ExpandProperty IPAddress -First 1)
  }
  catch {
    $ip = '127.0.0.1'
  }
  $env:LOCAL_HOSTNAME = $ip
}
Write-Host "LOCAL_HOSTNAME=$env:LOCAL_HOSTNAME"

# Simple template substitution for ${LOCAL_HOSTNAME}
function Expand-Template($inFile, $outFile) {
  if (Test-Path $inFile) {
    (Get-Content $inFile -Raw) -replace '\$\{LOCAL_HOSTNAME\}', $env:LOCAL_HOSTNAME | Set-Content $outFile
    Write-Host "Generated $outFile"
  }
}
Expand-Template (Join-Path $RepoRoot 'security/Containers/import/realm.template.json') (Join-Path $RepoRoot 'security/Containers/import/realm.json')
Expand-Template (Join-Path $RepoRoot 'mobile/src/lib/config/app_config.template.dart') (Join-Path $RepoRoot 'mobile/src/lib/config/app_config.generated.dart')
Expand-Template (Join-Path $RepoRoot 'frontend/src/src/environments/environment.template.ts') (Join-Path $RepoRoot 'frontend/src/src/environments/environment.ts')

# Jar detection (handle version suffixes)
$verifyDir = Join-Path $RepoRoot 'security/Containers/services/keycloak/verify-email/target'
$fhirDir = Join-Path $RepoRoot 'security/Containers/services/keycloak/fhir-listener/target'
$altchaOutput = if ($env:ALTCHA_OUTPUT) { $env:ALTCHA_OUTPUT } else {
  Join-Path $RepoRoot 'security/Containers/services/keycloak/altcha/target/keycloak-altcha-jar-with-dependencies.jar'
}

$verifyJar = Get-ChildItem -Path $verifyDir -Filter 'keycloak-emailveri-extensions*.jar' -File -ErrorAction SilentlyContinue | Select-Object -First 1
$fhirJar = Get-ChildItem -Path $fhirDir   -Filter 'keycloak-fhir-listener*.jar'        -File -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $verifyJar -or -not $fhirJar -or -not (Test-Path $altchaOutput)) {
  Write-Host "Keycloak jars missing; running Init-system.ps1..."
  $initPs = Join-Path $ScriptDir 'Init_system.ps1'
  if (Test-Path $initPs) {
    & $initPs
  }
  else {
    if (Test-Path (Join-Path $ScriptDir 'Init-system.sh')) {
      wsl.exe bash -lc "cd '$RepoRoot' && ./quick-run-scripts/Init-system.sh"
    }
    else {
      throw "Init-system not found."
    }
  }
}
else {
  Write-Host "Found jars: $($verifyJar.Name), $($fhirJar.Name)"
}

Write-Host "------------------------------------------------------------"
Write-Host "------------------------------------------------------------"
Write-Host "You can access the browser using https://$($env:LOCAL_HOSTNAME) *^_^*"
Write-Host "------------------------------------------------------------"
Write-Host "------------------------------------------------------------"

# Launch Windows Terminal tabs (one tab per service)
$Dir = $ScriptDir

wt.exe -w 0 `
  nt --title "certs"   -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File "../generate_certs.ps1" `; `
  nt --title "grafana" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_prome_and_grafana.ps1" `; `
  nt --title "Keycloak" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_kc_containers.ps1" `; `
  nt --title "Nginx"    -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_nginx_containers.ps1" `; `
  nt --title "FHIR"     -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_fhir_container.ps1" `; `
  nt --title "Frontend" -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_frontend.ps1" `; `
  nt --title "NodeJS"   -d "$Dir" powershell -ExecutionPolicy Bypass -NoExit -File ".\start_nodejs_containers.ps1"

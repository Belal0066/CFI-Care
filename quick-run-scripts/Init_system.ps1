# quick-run-scripts/Init-system.ps1
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

Write-Host "Init-system.ps1: building Keycloak extensions..."

$mvn = Get-Command mvn -ErrorAction SilentlyContinue
if (-not $mvn) {
  Write-Error "Maven (mvn) not found on PATH. Install Maven or run Init from WSL."
  exit 1
}

Push-Location $RepoRoot
try {
  & mvn -f "security/Containers/services/keycloak/fhir-listener/pom.xml" clean package
  & mvn -f "security/Containers/services/keycloak/verify-email/pom.xml" clean package
} finally {
  Pop-Location
}

# Altcha extension
$altchaRepo    = "https://github.com/lacontrevoie/keycloak-altcha.git"
$altchaRef     = if ($env:ALTCHA_REF) { $env:ALTCHA_REF } else { "main" }
$altchaWorkdir = Join-Path $RepoRoot "security/Containers/services/keycloak/altcha/keycloak-altcha"
$altchaJar     = Join-Path $altchaWorkdir "target/keycloak-altcha-jar-with-dependencies.jar"
$altchaOutput  = if ($env:ALTCHA_OUTPUT) { $env:ALTCHA_OUTPUT } else {
  Join-Path $RepoRoot "security/Containers/services/keycloak/altcha/target/keycloak-altcha-jar-with-dependencies.jar"
}

if (-not (Test-Path (Join-Path $altchaWorkdir ".git"))) {
  Write-Host "Init-system.ps1: Altcha repo missing, cloning..."
  git clone $altchaRepo $altchaWorkdir
}

Push-Location $altchaWorkdir
try {
  git checkout $altchaRef
  & mvn clean package
} finally {
  Pop-Location
}

$outDir = Split-Path -Parent $altchaOutput
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}
Copy-Item $altchaJar $altchaOutput -Force

Write-Host "Init-system.ps1: done :D"
Write-Host "------------------------------------"
Write-Host "------------------------------------"

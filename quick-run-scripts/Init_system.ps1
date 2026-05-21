# quick-run-scripts/Init-system.ps1
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

Write-Host "Init-system.ps1: building Keycloak extensions..."

# Run Maven on the two modules (assumes mvn is on PATH)
$mvn = Get-Command mvn -ErrorAction SilentlyContinue
if (-not $mvn) {
  Write-Error "Maven (mvn) not found on PATH. Install Maven or run Init from WSL."
  exit 1
}

Push-Location $RepoRoot
try {
  & mvn -f "security/Containers/services/keycloak/fhir-listener/pom.xml" clean package || Write-Warning "fhir-listener build failed (non-fatal)."
  & mvn -f "security/Containers/services/keycloak/verify-email/pom.xml" clean package
} finally {
  Pop-Location
}

Write-Host "Init-system.ps1: build finished."
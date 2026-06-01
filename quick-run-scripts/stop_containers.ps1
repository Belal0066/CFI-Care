$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $root "..")).Path

Set-Location (Join-Path $RepoRoot "security/Containers")
docker compose -f docker-compose-nginx.yml down
docker compose -f docker-compose-kc.yml down
docker compose -f docker-compose-vault.yml down

Set-Location (Join-Path $RepoRoot "frontend")
docker compose -f docker-compose.yaml down

Set-Location (Join-Path $RepoRoot "backend/src/Nodejs")
docker compose -f docker-compose.yml down

Set-Location (Join-Path $RepoRoot "backend/src/FHIR")
docker compose -f docker-compose.yml down

Set-Location $root
Write-Host "All containers stopped successfully!" -ForegroundColor Green

# Stop script on first error (equivalent to set -e)
$ErrorActionPreference = "Stop"

Write-Host "Waiting for Docker daemon..." -ForegroundColor Cyan

# Temporarily allow errors so the Docker check doesn't crash the whole script
$ErrorActionPreference = "Continue"

# Wait for Docker to start using $LASTEXITCODE instead of boolean logic
while ($true) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        break
    }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 5
}

# Turn strict error checking back on for the rest of the script
$ErrorActionPreference = "Stop"

Write-Host "`nDocker is active! Starting Frontend..." -ForegroundColor Green

# Go up one level from 'quick-run-scripts' to find 'frontend'
$FrontendPath = "$PSScriptRoot\..\frontend"

if (Test-Path $FrontendPath) {
    Set-Location $FrontendPath
    
    # Run Docker Compose
    docker compose -f "docker-compose.yaml" up --build
}
else {
    Write-Error "Could not find 'frontend' folder at $FrontendPath"
}
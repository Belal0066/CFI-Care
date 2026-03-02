# Stop script on first error (equivalent to set -e)
$ErrorActionPreference = "Stop"

Write-Host "Waiting for Docker daemon..." -ForegroundColor Cyan

# Wait for Docker to start (equivalent to the while loop)
# We redirect error output (2>$null) to keep the console clean while waiting
while (-not (docker info 2>$null)) {
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 5
}

Write-Host "`nDocker is active! Starting Frontend..." -ForegroundColor Green

# Change directory to frontend
# "Set-Location" is the PowerShell name for "cd"
if (Test-Path "frontend") {
    Set-Location "frontend"
    
    # Run Docker Compose
    docker compose -f "docker-compose.yaml" up --build
} else {
    Write-Error "Could not find 'frontend' folder in $PWD"
}
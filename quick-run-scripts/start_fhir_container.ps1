function Wait-Docker {
    while ($true) {
        try {
            docker info *> $null
            break
        } catch {
            Start-Sleep -Seconds 5
        }
    }
}

Wait-Docker
Set-Location "$PSScriptRoot/backend/src/FHIR"
docker compose -f docker-compose.yml up

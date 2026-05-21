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
Set-Location "$PSScriptRoot/security/Containers"
docker compose -f docker-compose-nginx.yml up --build

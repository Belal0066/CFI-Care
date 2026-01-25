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

function Wait-Network($name) {
    while ($true) {
        try {
            docker network inspect $name *> $null
            break
        } catch {
            Start-Sleep -Seconds 5
        }
    }
}

Wait-Docker
Wait-Network -name "containers_nginx-network"
Set-Location "$PSScriptRoot/backend/src/Nodejs"
docker compose -f docker-compose.yml up --build

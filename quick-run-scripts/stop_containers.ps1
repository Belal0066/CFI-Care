$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location "$root/security/Containers"
docker compose -f docker-compose-nginx.yml down

Set-Location "$root/security/Containers"
docker compose -f docker-compose-kc.yml down

Set-Location "$root/backend/src/Nodejs"
docker compose -f docker-compose.yml down

Set-Location "$root/backend/src/FHIR"
docker compose -f docker-compose.yml down

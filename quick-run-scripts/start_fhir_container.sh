set -eou pipefail

while ! docker info >/dev/null 2>&1; do
    sleep 5
done

cd ../backend/src/FHIR/
 docker compose -f docker-compose.yml up 

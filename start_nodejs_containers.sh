
set -eou pipefail
while ! docker info >/dev/null 2>&1; do
    sleep 5
done
cd backend/src/Nodejs/
 docker compose -f docker-compose.yml up


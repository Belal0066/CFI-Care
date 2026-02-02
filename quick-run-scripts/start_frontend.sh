set -eou pipefail
# Wait for Docker to start
while ! docker info >/dev/null 2>&1; do
    sleep 5
done

cd frontend/
    docker compose -f docker-compose.yaml up --build


# cd frontend/src/
    # ng serve --open


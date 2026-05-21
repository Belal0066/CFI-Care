set -eou pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Wait for Docker to start
while ! docker info >/dev/null 2>&1; do
    sleep 5
done

cd "$REPO_ROOT/frontend/"
    docker compose -f docker-compose.yaml up --build


# cd frontend/src/
    # ng serve --open


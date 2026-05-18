set -eou pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

while ! docker info >/dev/null 2>&1; do
    sleep 5
done

cd "$REPO_ROOT/backend/src/FHIR/"
 docker compose -f docker-compose.yml up 

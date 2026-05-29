set -eou pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Wait for Docker to start
while ! docker info >/dev/null 2>&1; do
    sleep 5
done

PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-$(hostname -I | awk '{print $1}')}
export PUBLIC_HOSTNAME


 cd "$REPO_ROOT/security/Containers/"
 docker compose -f docker-compose-kc.yml up #--build

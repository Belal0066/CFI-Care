
set -eou pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

while ! docker info >/dev/null 2>&1; do
    sleep 5
done

# wait for nginx network as well 
while ! docker network inspect containers_nginx-network >/dev/null 2>&1; do
    sleep 5
done

# LOCAL_HOSTNAME=${LOCAL_HOSTNAME:-$(hostname -I | awk '{print $1}')}
# export LOCAL_HOSTNAME

cd "$REPO_ROOT/backend/src/Nodejs/"
 docker compose -f docker-compose-prom-grafana.yml up  --build



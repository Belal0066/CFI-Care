
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

# while true; do
#   status="$(docker inspect -f '{{.State.Health.Status}}' redisStore 2>/dev/null || echo "missing Redis Store Session cache")"
#   if [ "$status" = "healthy" ]; then break; fi
#   sleep 2
# done

PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-$(hostname -I | awk '{print $1}')}
export PUBLIC_HOSTNAME

cd "$REPO_ROOT/backend/src/Nodejs/"
 docker compose -f docker-compose.yml up  --build



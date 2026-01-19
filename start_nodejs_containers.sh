
set -eou pipefail
while ! docker info >/dev/null 2>&1; do
    sleep 5
done

# wait for nginx network as well 
while ! docker network inspect containers_nginx-network >/dev/null 2>&1; do
    sleep 5
done

while [ "`docker inspect -f {{.State.Health.Status}} redisStore`" != "healthy" ]; do     sleep 2; done

cd backend/src/Nodejs/
 docker compose -f docker-compose.yml up  #--build



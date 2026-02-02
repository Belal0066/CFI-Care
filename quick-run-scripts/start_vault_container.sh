set -eou pipefail
# Wait for Docker to start
while ! docker info >/dev/null 2>&1; do
    sleep 5
done
 cd ./security/Containers/
 docker compose -f docker-compose-vault.yml up 
#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-$(hostname -I | awk '{print $1}')}
export PUBLIC_HOSTNAME

 cd "$REPO_ROOT/security/Containers/"
    docker compose -f docker-compose-nginx.yml down 
    docker compose -f docker-compose-kc.yml down 
    docker compose -f docker-compose-vault.yml down

cd "$REPO_ROOT/frontend/"
    docker compose -f docker-compose.yaml down

    
cd "$REPO_ROOT/backend/src/Nodejs/"
#  sudo docker compose -f docker-compose-redisStore.yml down
#  pkill -f 'node index.js' || true	
    docker compose -f docker-compose.yml down


    
cd "$REPO_ROOT/backend/src/FHIR/"
    docker compose -f docker-compose.yml down

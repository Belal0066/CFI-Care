#!/bin/bash

 cd security/Containers/
    docker compose -f docker-compose-nginx.yml down 
    docker compose -f docker-compose-kc.yml down 
    docker compose -f docker-compose-vault.yml down

cd ../../frontend/
    docker compose -f docker-compose.yaml down

    
cd ../backend/src/Nodejs/
#  sudo docker compose -f docker-compose-redisStore.yml down
#  pkill -f 'node index.js' || true	
    docker compose -f docker-compose.yml down


    
cd ../FHIR
    docker compose -f docker-compose.yml down

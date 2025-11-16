#!/bin/bash

 cd security/Containers/
 sudo docker compose -f docker-compose-nginx.yml down 
 cd ../../backend/src/Nodejs/
 sudo docker compose -f docker-compose-redisStore.yml down
 pkill -f 'node index.js' || true	

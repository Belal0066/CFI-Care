#!/bin/bash
set -eou pipefail
# Log file for debugging
LOG_FILE="/var/log/docker_startup.log"
# Function to log messages
log_message() {
   echo "$(date): $1" >> "$LOG_FILE"
}
# Wait for Docker to start
while ! docker info >/dev/null 2>&1; do
    log_message "Waiting for Docker to start..."
    sleep 5
done
log_message "Docker is running. Starting containers..."
# Start your containers here
#docker start container1
#docker start container2
#docker start container3
# Or use docker-compose if you have a docker-compose.yml file
 cd ./security/Containers/
 docker compose -f docker-compose-nginx.yml up
log_message "Containers started successfully"

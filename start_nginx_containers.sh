#!/bin/bash
set -eou pipefail
# Log file for debugging
LOG_FILE="./docker_startup.log"
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

cd ./security/Containers/
docker compose -f docker-compose-nginx.yml up
log_message "Containers started successfully"

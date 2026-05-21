#!/bin/bash
set -eou pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"


VAULT_DIR="$REPO_ROOT/security/Containers/services/hashicorp"
VAULT_CONFIG_TEMPLATE="$VAULT_DIR/config/vault-config.template.json"
VAULT_CONFIG_GENERATED="$VAULT_DIR/config/vault-config.generated.json"

export VAULT_API_ADDR="${VAULT_API_ADDR:-http://127.0.0.1:8200}"
export VAULT_CONFIG_FILE="${VAULT_CONFIG_FILE:-vault-config.generated.json}"

envsubst < "$VAULT_CONFIG_TEMPLATE" > "$VAULT_CONFIG_GENERATED"


# Wait for Docker to start
while ! docker info >/dev/null 2>&1; do
    sleep 5
done
 cd "$REPO_ROOT/security/Containers/"
 docker compose -f docker-compose-vault.yml up --build
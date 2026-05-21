#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"


OAUTH_ROLE_DIR="$REPO_ROOT/security/Containers/services/oauth2-proxy/vault/role"
KC_ROLE_DIR="$REPO_ROOT/security/Containers/services/keycloak/vault/role"
NODEJS_ROLE_DIR="$REPO_ROOT/security/Containers/services/nodejs/vault/role"

# mkdir -p "$OAUTH_ROLE_DIR" "$KC_ROLE_DIR" "$NODEJS_ROLE_DIR"

VAULT_ADDR="http://127.0.0.1:8200"
UNSEAL_KEY="$REPO_ROOT/quick-run-scripts/vault/key"
TOKEN="$REPO_ROOT/quick-run-scripts/vault/token"


while ! docker ps | grep "vault"  >/dev/null 2>&1; do
    sleep 5
done

echo "Gaining access to vault"

# docker exec vault sh -lc 'export VAULT_ADDR=http://127.0.0.1:8200'

docker exec -i -e VAULT_ADDR="$VAULT_ADDR" vault sh -lc 'vault operator unseal "$(cat)"' < "$UNSEAL_KEY"

docker exec -e VAULT_ADDR="$VAULT_ADDR" -e VAULT_TOKEN="$(<"$TOKEN")" vault sh -lc 'vault token lookup >/dev/null'


echo "Refreshing secret IDs"

umask 022
docker exec -e VAULT_ADDR="$VAULT_ADDR" -e VAULT_TOKEN="$(<"$TOKEN")" vault sh -lc \
  'vault write -f -field=secret_id auth/approle/role/oauth-role/secret-id' > "$OAUTH_ROLE_DIR/secret_id"

docker exec -e VAULT_ADDR="$VAULT_ADDR" -e VAULT_TOKEN="$(<"$TOKEN")" vault sh -lc \
  'vault write -f -field=secret_id auth/approle/role/keycloak-role/secret-id' > "$KC_ROLE_DIR/secret_id"

docker exec -e VAULT_ADDR="$VAULT_ADDR" -e VAULT_TOKEN="$(<"$TOKEN")" vault sh -lc \
  'vault write -f -field=secret_id auth/approle/role/nodejs-role/secret-id' > "$NODEJS_ROLE_DIR/secret_id"

chmod 644 "$OAUTH_ROLE_DIR/secret_id" "$KC_ROLE_DIR/secret_id" "$NODEJS_ROLE_DIR/secret_id"
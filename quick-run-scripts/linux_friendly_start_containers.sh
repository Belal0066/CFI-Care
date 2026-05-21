 #!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# VERIFY_EMAIL_JAR="$REPO_ROOT/security/Containers/services/keycloak/verify-email/target/keycloak-emailveri-extensions.jar"
shopt -s nullglob
verify_files=("$REPO_ROOT/security/Containers/services/keycloak/verify-email/target"/keycloak-emailveri-extensions*.jar)
VERIFY_EMAIL_JAR="${verify_files[0]:-}"

fhir_files=("$REPO_ROOT/security/Containers/services/keycloak/fhir-listener/target"/keycloak-fhir-listener*.jar)
FHIR_LISTENER_JAR="${fhir_files[0]:-}"
shopt -u nullglob


# check if jar files have been created correctly
if [ -z "$VERIFY_EMAIL_JAR" ] || [ -z "$FHIR_LISTENER_JAR" ] || [ ! -f "$VERIFY_EMAIL_JAR" ] || [ ! -f "$FHIR_LISTENER_JAR" ]; then
  "$SCRIPT_DIR/Init-system.sh"
fi


PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-$(hostname -I | awk '{print $1}')}
export PUBLIC_HOSTNAME



# inject hostname into environment
envsubst < "$REPO_ROOT/security/Containers/import/realm.template.json" > "$REPO_ROOT/security/Containers/import/realm.json"
envsubst < "$REPO_ROOT/mobile/src/lib/config/app_config.template.dart" > "$REPO_ROOT/mobile/src/lib/config/app_config.generated.dart"
envsubst < "$REPO_ROOT/frontend/src/src/environments/environment.template.ts" > "$REPO_ROOT/frontend/src/src/environments/environment.ts"
# envsubst < "$REPO_ROOT/mobile/src/env/dev_env.template.json" > "$REPO_ROOT/mobile/src/env/dev_env.json"

shopt -s nullglob
VAULT_FILE=("$SCRIPT_DIR/vault/key")
VAULT_EXISTS="${VAULT_FILE[0]:-}"
shopt -s nullglob

if [[ "$VAULT_EXISTS" ]];then

gnome-terminal -- bash -c "./start_vault_container.sh; exec bash"

echo " Initializing vault :/"
"$SCRIPT_DIR/vault_id_refresh.sh"

fi

echo "------------------------------------------------------------"
echo "Starting Containers :D"
gnome-terminal -- bash -c "./start_kc_containers.sh; exec bash"
gnome-terminal -- bash -c "./start_nodejs_containers.sh; exec bash"
gnome-terminal -- bash -c "./start_fhir_container.sh; exec bash"
gnome-terminal -- bash -c "./start_frontend.sh; exec bash"
gnome-terminal -- bash -c "./start_nginx_containers.sh; exec bash"

echo "------------------------------------------------------------"
echo "------------------------------------------------------------"
echo "You can access the browser using https://${PUBLIC_HOSTNAME} •ᴗ•"
echo "------------------------------------------------------------"
#!/bin/bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

shopt -s nullglob
verify_files=("$REPO_ROOT/security/Containers/services/keycloak/verify-email/target"/keycloak-emailveri-extensions*.jar)
VERIFY_EMAIL_JAR="${verify_files[0]:-}"
fhir_files=("$REPO_ROOT/security/Containers/services/keycloak/fhir-listener/target"/keycloak-fhir-listener*.jar)
FHIR_LISTENER_JAR="${fhir_files[0]:-}"
shopt -u nullglob

if [ -z "$VERIFY_EMAIL_JAR" ] || [ -z "$FHIR_LISTENER_JAR" ] || [ ! -f "$VERIFY_EMAIL_JAR" ] || [ ! -f "$FHIR_LISTENER_JAR" ]; then
  "$SCRIPT_DIR/Init-system.sh"
fi

PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-$(hostname -I | awk '{print $1}')}
export PUBLIC_HOSTNAME

if command -v envsubst >/dev/null 2>&1; then
  envsubst < "$REPO_ROOT/security/Containers/import/realm.template.json" > "$REPO_ROOT/security/Containers/import/realm.json" || true
  envsubst < "$REPO_ROOT/mobile/src/lib/config/app_config.template.dart" > "$REPO_ROOT/mobile/src/lib/config/app_config.generated.dart" || true
  envsubst < "$REPO_ROOT/frontend/src/src/environments/environment.template.ts" > "$REPO_ROOT/frontend/src/src/environments/environment.ts" || true
fi


# 1. Convert current directory to Windows format (e.g., C:\Users\...)
#    This handles spaces correctly (like in "Fall 2025")
DIR_WIN=$(wslpath -w "$(pwd)")

# 2. Launch tabs
#    -w 0        : Attach to current window
#    nt          : New tab
#    -d "$DIR_WIN": Set starting directory to current project folder
#    wsl.exe     : The command to run (enters Linux)

wt.exe -w 0 nt --title "Keycloak" -d "$DIR_WIN" wsl.exe bash -c "./start_kc_containers.sh; exec bash" &
wt.exe -w 0 nt --title "Nginx"    -d "$DIR_WIN" wsl.exe bash -c "./start_nginx_containers.sh; exec bash" &
wt.exe -w 0 nt --title "FHIR"     -d "$DIR_WIN" wsl.exe bash -c "./start_fhir_container.sh; exec bash" &
wt.exe -w 0 nt --title "Frontend" -d "$DIR_WIN" wsl.exe bash -c "./start_frontend.sh; exec bash" &
wt.exe -w 0 nt --title "NodeJS"   -d "$DIR_WIN" wsl.exe bash -c "./start_nodejs_containers.sh; exec bash" &
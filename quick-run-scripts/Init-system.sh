#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Init-system script: building keycloak extensions, may take a while :("
cd "$REPO_ROOT/security/Containers/services/keycloak/fhir-listener"
mvn  clean package 

cd "$REPO_ROOT/security/Containers/services/keycloak/verify-email"
mvn  clean package

cd "$SCRIPT_DIR"



echo "Init-system script: done :D"
echo "------------------------------------"
echo "------------------------------------"
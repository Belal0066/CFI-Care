#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Init-system script: building keycloak extensions, may take a while :("

mvn -f security/Containers/services/keycloak/fhir-listener/pom.xml clean package || true
mvn -f security/Containers/services/keycloak/verify-email/pom.xml clean package


echo "Init-system script: done :D"
echo "------------------------------------"
echo "------------------------------------"
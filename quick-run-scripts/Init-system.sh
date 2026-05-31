#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Init-system script: building keycloak extensions, may take a while :("
cd "$REPO_ROOT/security/Containers/services/keycloak/fhir-listener"
mvn  clean package 

cd "$REPO_ROOT/security/Containers/services/keycloak/verify-email"
mvn  clean package

cd "$REPO_ROOT/security/Containers/services/keycloak/altcha"

ALTCHA_REPO="https://github.com/lacontrevoie/keycloak-altcha.git"
ALTCHA_REF="${ALTCHA_REF:-main}"
ALTCHA_WORKDIR="$REPO_ROOT/security/Containers/services/keycloak/altcha/keycloak-altcha"
ALTCHA_JAR="$ALTCHA_WORKDIR/target/keycloak-altcha-jar-with-dependencies.jar"
ALTCHA_OUTPUT="${ALTCHA_OUTPUT:-$REPO_ROOT/security/Containers/services/keycloak/altcha/target/keycloak-altcha-jar-with-dependencies.jar}"

# if [[ ! -f "$ALTCHA_OUTPUT" ]]; then
#   echo "Init-system script: Altcha jar missing, fetching and building"
  if [[ ! -d "$ALTCHA_WORKDIR/.git" ]]; then
  echo "Init-system script: Altcha jar missing, fetching and building"
    git clone "$ALTCHA_REPO" "$ALTCHA_WORKDIR"
  fi

  (
    cd "$ALTCHA_WORKDIR"
    git checkout "$ALTCHA_REF"
    mvn clean package
  )

  mkdir -p "$(dirname "$ALTCHA_OUTPUT")"
  cp "$ALTCHA_JAR" "$ALTCHA_OUTPUT"
# fi
cd "$SCRIPT_DIR"



echo "Init-system script: done :D"
echo "------------------------------------"
echo "------------------------------------"
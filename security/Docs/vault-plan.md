# Vault Plan

## goal

Use HashiCorp Vault as the source of truth for sensitive values, while keeping normal runtime config in env files or templates 


## Architecture

- One central Vault server
- One Vault Agent sidecar per service
- Separate auth and policy per service
- Separate secret paths per service
- Render only the file each service already expects

## Secret Path Layout
- `secret/dev/nodejs/*`
- `secret/dev/keycloak/*`
- `secret/dev/oauth/*`

## Service Mapping

### NodeJS
- Reads only NodeJS-specific secrets
- secrets:
  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_NAME`
  - `DB_SSL`
  - `KC_CLIENT_SECRET`
  - `CLIENT_SECRET`
  - `SESSION_SECRET`
  - `REDIS_URL_PATIENTS`
- Output:
  - rendered .env file for the NodeJS container

### Keycloak
- Reads only Keycloak-specific secrets
- secrets:
  - `KC_SPI_EVENTS_LISTENER_FHIR_PROVISIONER_LISTENER_CLIENT_SECRET`
- Output:
  - rendered env file for the Keycloak container

### oauth2-proxy / nginx
- Reads only oauth-specific secrets
- secrets:
  - `OAUTH2_PROXY_CLIENT_SECRET`
  - `OAUTH2_PROXY_COOKIE_SECRET`
- Output:
  - rendered env file for the oauth2-proxy container

## Auth and Policy
- Use a separate Vault auth identity per service
- Use a separate policy per service
- Containers can't acccess the root token
- Use short-lived credentials (24 h)

## Delivery Pattern
- Vault stores secrets centrally
- Vault Agent authenticates on behalf of each service
- Vault Agent outputs the secrets into a local file
- The container reads that file at startup 

## Why This Approach
- Limits access by service
- Avoids duplicating the secrets across multiple env files

## Recommended Implementation Order
1. Define secret paths in Vault
2. Write one policy per service
3. Create one auth method per service
4. Add one Vault Agent sidecar per service
5. Render the final env file each service expects

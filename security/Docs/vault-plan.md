# Vault Plan

## Goal
Use HashiCorp Vault as the source of truth for sensitive values, while keeping normal runtime config in env files or templates. The system should support collaboration across different machines without exposing secrets in git or relying on a single root token workflow.

## Architecture
- One central Vault server.
- One Vault Agent sidecar per service.
- Separate auth and policy per service.
- Separate secret paths per service.
- Render only the file each service already expects.

## Secret Path Layout
- `secret/dev/nodejs/*`
- `secret/dev/keycloak/*`
- `secret/dev/oauth/*`

## Service Mapping
### NodeJS
- Reads only NodeJS-specific secrets.
- Example secrets:
  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_NAME`
  - `DB_SSL`
  - `KC_CLIENT_SECRET`
  - `CLIENT_SECRET`
  - `SESSION_SECRET`
- Output:
  - rendered env/config file for the NodeJS container

### Keycloak
- Reads only Keycloak-specific secrets.
- Example secrets:
  - `KC_PROVISIONER_CLIENT_SECRET`
- Output:
  - rendered env/config file for the Keycloak container

### oauth2-proxy / nginx
- Reads only oauth-specific secrets.
- Example secrets:
  - `COOKIE_SECRET`
- Output:
  - rendered env/config file for the oauth2-proxy/nginx container

## Auth and Policy
- Use a separate Vault auth identity per service.
- Use a separate policy per service.
- Do not give containers the root token.
- Prefer short-lived or limited-usage credentials.

## Delivery Pattern
- Vault stores secrets centrally.
- Vault Agent authenticates on behalf of each service.
- Vault Agent renders the secrets into a local file.
- The container reads that file at startup or runtime.

## Why This Approach
- Keeps secrets out of version control.
- Allows multiple developers and machines to use the same secret source.
- Limits access by service.
- Avoids duplicating the same secret across multiple env files.
- Scales better than manual env-file syncing.

## What Not To Do
- Do not store the same secret in multiple repo files as the source of truth.
- Do not use the Vault root token inside application containers.
- Do not make one shared policy for all services.
- Do not expose Vault publicly unless you really need to.

## Recommended Implementation Order
1. Define secret paths in Vault.
2. Write one policy per service.
3. Create one auth method per service.
4. Add one Vault Agent sidecar per service.
5. Render the final env/config file each service already expects.
6. Keep non-secret config in the existing env files.

## Notes
- If a secret is used by only one service, it should live in that service’s Vault path.
- If a secret is used by multiple services, either share it through a common path or split it only when the use really differs.
- For this repo, the clean separation is NodeJS, Keycloak, and oauth2-proxy/nginx, each with its own secret path and policy.
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..")).Path

$vaultAddr     = "http://127.0.0.1:8200"
$unsealKeyFile = Join-Path $ScriptDir "vault/key"
$tokenFile     = Join-Path $ScriptDir "vault/token"

$oauthRoleDir  = Join-Path $RepoRoot "security/Containers/services/oauth2-proxy/vault/role"
$kcRoleDir     = Join-Path $RepoRoot "security/Containers/services/keycloak/vault/role"
$nodejsRoleDir = Join-Path $RepoRoot "security/Containers/services/nodejs/vault/role"

# Wait for vault container
while (-not (docker ps | Select-String "vault")) {
    Start-Sleep -Seconds 5
}

Write-Host "Gaining access to vault"

$unsealKey = (Get-Content $unsealKeyFile -Raw).Trim()
$unsealKey | docker exec -i -e "VAULT_ADDR=$vaultAddr" vault sh -lc 'vault operator unseal "$(cat)"'

$token = (Get-Content $tokenFile -Raw).Trim()
docker exec -e "VAULT_ADDR=$vaultAddr" -e "VAULT_TOKEN=$token" vault sh -lc 'vault token lookup >/dev/null'

Write-Host "Refreshing secret IDs"

$oauthSecretId = docker exec -e "VAULT_ADDR=$vaultAddr" -e "VAULT_TOKEN=$token" vault sh -lc `
    'vault write -f -field=secret_id auth/approle/role/oauth-role/secret-id'
Set-Content -Path (Join-Path $oauthRoleDir "secret_id") -Value $oauthSecretId -NoNewline

$kcSecretId = docker exec -e "VAULT_ADDR=$vaultAddr" -e "VAULT_TOKEN=$token" vault sh -lc `
    'vault write -f -field=secret_id auth/approle/role/keycloak-role/secret-id'
Set-Content -Path (Join-Path $kcRoleDir "secret_id") -Value $kcSecretId -NoNewline

$nodejsSecretId = docker exec -e "VAULT_ADDR=$vaultAddr" -e "VAULT_TOKEN=$token" vault sh -lc `
    'vault write -f -field=secret_id auth/approle/role/nodejs-role/secret-id'
Set-Content -Path (Join-Path $nodejsRoleDir "secret_id") -Value $nodejsSecretId -NoNewline

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

$vaultDir              = Join-Path $RepoRoot "security/Containers/services/hashicorp"
$vaultConfigTemplate   = Join-Path $vaultDir "config/vault-config.template.json"
$vaultConfigGenerated  = Join-Path $vaultDir "config/vault-config.generated.json"

if (-not $env:VAULT_API_ADDR)   { $env:VAULT_API_ADDR   = "http://127.0.0.1:8200" }
if (-not $env:VAULT_CONFIG_FILE){ $env:VAULT_CONFIG_FILE = "vault-config.generated.json" }

if (Test-Path $vaultConfigTemplate) {
    (Get-Content $vaultConfigTemplate -Raw) `
        -replace '\$\{VAULT_API_ADDR\}',   $env:VAULT_API_ADDR `
        -replace '\$\{VAULT_CONFIG_FILE\}', $env:VAULT_CONFIG_FILE |
        Set-Content $vaultConfigGenerated
    Write-Host "Generated $vaultConfigGenerated"
}

function Wait-Docker {
    while ($true) {
        try { docker info *> $null; break }
        catch { Start-Sleep -Seconds 5 }
    }
}

Wait-Docker

if (-not $env:LOCAL_HOSTNAME) {
    try {
        $env:LOCAL_HOSTNAME = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
            Select-Object -ExpandProperty IPAddress -First 1)
    } catch {
        $env:LOCAL_HOSTNAME = '127.0.0.1'
    }
}

Set-Location (Join-Path $RepoRoot "security/Containers")
docker compose -f docker-compose-vault.yml up --build

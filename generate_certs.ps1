# Stop execution on any error (equivalent to 'set -e' in bash)
$ErrorActionPreference = 'Stop'

# 1. Set the target directory for certificates
$certDir = Join-Path $PSScriptRoot "security\Containers\certs"

# Dynamically grab the local IP address (equivalent to hostname -I)
# Looks for the first IPv4 address that isn't a loopback or APIPA address
$localHostname = $env:LOCAL_HOSTNAME
if ([string]::IsNullOrWhiteSpace($localHostname)) {
    $localHostname = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object { 
            $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\.254\." 
        }).IPAddress | Select-Object -First 1
}

Write-Host "--- Starting Certificate Generation ---" -ForegroundColor Cyan

if (-not (Test-Path -Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}
Set-Location -Path $certDir

# 2 & 3. Install required tools (mkcert & openssl) via Chocolatey
Write-Host "Checking dependencies..." -ForegroundColor Magenta

# Check for Chocolatey and install if missing
if (-not (Get-Command "choco" -ErrorAction SilentlyContinue)) {
    Write-Host "Chocolatey not found. Attempting installation..." -ForegroundColor Yellow
    $chocoPath = "$env:ALLUSERSPROFILE\chocolatey"
    
    if (Test-Path $chocoPath) {
        Write-Host "Found broken Chocolatey folder. Cleaning up..." -ForegroundColor Red
        Remove-Item -Path $chocoPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    # Force refresh the PATH immediately for this session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Check for mkcert and openssl
$tools = @("mkcert", "openssl")
foreach ($tool in $tools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "Installing $tool..." -ForegroundColor Magenta
        choco install $tool -y
    }
    else {
        Write-Host "$tool is already installed."
    }
}

# Final Path Refresh to ensure newly installed tools are visible
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# 4. Initialize mkcert (The "Trust" step)
Write-Host "Setting up mkcert CA..." -ForegroundColor Yellow
& mkcert -install

# 5. Generate Certificates (Now including the dynamic Local IP)
Write-Host "Generating Certificates..." -ForegroundColor Yellow
& mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem $localHostname localhost 127.0.0.1 ::1 host.docker.internal
& mkcert -key-file key.pem -cert-file cert.pem $localHostname localhost 127.0.0.1 ::1 host.docker.internal

# 6. Create Java Keystore
Write-Host "Creating Java Keystore..." -ForegroundColor Yellow
cmd /c "openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret"

# 7. Copy Root CA
Write-Host "Handling Root CA..." -ForegroundColor Yellow
$caRootPath = & mkcert -CAROOT
$sourceCaFile = Join-Path $caRootPath "rootCA.pem"
$targetCaFile = Join-Path $certDir "rootCA.pem"

if (Test-Path -Path $targetCaFile) {
    Remove-Item -Path $targetCaFile -Recurse -Force
}

Copy-Item -Path $sourceCaFile -Destination $targetCaFile -Force

# 8. Verification
Write-Host "`nDONE! Certificates generated successfully." -ForegroundColor Green
Get-ChildItem . | Format-Table Name, Length, LastWriteTime -AutoSize
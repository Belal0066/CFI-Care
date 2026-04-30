# 1. Set the target directory for certificates
$certDir = Join-Path $PSScriptRoot "Containers\certs"
Write-Host "--- Starting Certificate Generation ---" -ForegroundColor Cyan

if (-not (Test-Path -Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir | Out-Null
}
Set-Location -Path $certDir

# 2. Repair & Install Chocolatey
if (-not (Get-Command "choco" -ErrorAction SilentlyContinue)) {
    $chocoPath = "C:\ProgramData\chocolatey"
    if (Test-Path $chocoPath) {
        Write-Host "Found broken Chocolatey folder. Cleaning up..." -ForegroundColor Red
        Remove-Item -Path $chocoPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Installing Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    # Force refresh the PATH immediately for this session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 3. Install required tools (mkcert & openssl)
$tools = @("mkcert", "openssl")
foreach ($tool in $tools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "Installing $tool..." -ForegroundColor Magenta
        choco install $tool -y
    }
}

# Final Path Refresh to ensure mkcert/openssl are visible
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 4. Initialize mkcert (The "Trust" step)
Write-Host "Setting up mkcert CA..." -ForegroundColor Yellow
& mkcert -install

# 5. Generate Certificates
Write-Host "Generating Certificates..." -ForegroundColor Yellow
& mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem localhost 127.0.0.1 ::1 host.docker.internal
& mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1 host.docker.internal

# 6. Create Java Keystore
Write-Host "Creating Java Keystore..." -ForegroundColor Yellow
cmd /c "openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret"

# 7. Copy Root CA and Fix folder-vs-file issue
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
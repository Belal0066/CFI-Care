# 1. Set the target directory for certificates
$certDir = Join-Path $PSScriptRoot "Containers\certs"
Write-Host "Navigating to certificate directory: $certDir" -ForegroundColor Cyan

# Create directory if it doesn't exist
if (-not (Test-Path -Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir | Out-Null
}

Set-Location -Path $certDir

# 2. Check for required tools
if (-not (Get-Command "mkcert" -ErrorAction SilentlyContinue)) {
    Write-Error "mkcert is not installed or not in your PATH."
    exit 1
}
if (-not (Get-Command "openssl" -ErrorAction SilentlyContinue)) {
    Write-Error "openssl is not installed or not in your PATH."
    exit 1
}

# 3. Generate Certificates
Write-Host "Generating Keycloak certificates..." -ForegroundColor Yellow
mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem kc.localhost 127.0.0.1 ::1

Write-Host "Generating Localhost certificates..." -ForegroundColor Yellow
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1

# 4. Create Keystore (PKCS12)
Write-Host "Creating Java Keystore (keystore.p12)..." -ForegroundColor Yellow
# We use 'cmd /c' to ensure openssl runs correctly across different PS versions
cmd /c "openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret"

# 5. Fix Root CA (The folder vs file issue)
Write-Host "Fixing Root CA..." -ForegroundColor Yellow

# Get the actual location of the root CA from mkcert
$caRootPath = mkcert -CAROOT
$sourceCaFile = Join-Path $caRootPath "rootCA.pem"
$targetCaFile = Join-Path $certDir "rootCA.pem"

# Check if the destination exists and is a directory (the error you had)
if (Test-Path -Path $targetCaFile -PathType Container) {
    Write-Host "   Found 'rootCA.pem' as a folder. Deleting it..." -ForegroundColor Red
    Remove-Item -Path $targetCaFile -Recurse -Force
}

# Copy the valid rootCA.pem file
Write-Host "   Copying valid rootCA.pem from $sourceCaFile" -ForegroundColor Green
Copy-Item -Path $sourceCaFile -Destination $targetCaFile -Force

# 6. Verification
Write-Host "`nSuccess! All certificates are ready." -ForegroundColor Green
Write-Host "   Location: $certDir"
Get-ChildItem . | Format-Table Name, Length, LastWriteTime -AutoSize
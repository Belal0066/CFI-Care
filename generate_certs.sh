#!/bin/bash

# Stop execution on any error
set -e

# --- Configuration & Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# 1. Set the target directory for certificates
# Get the directory where the script is currently located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/security/Containers/certs"


PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-$(hostname -I | awk '{print $1}')}
echo -e "${CYAN}--- Starting Certificate Generation ---${NC}"

if [ ! -d "$CERT_DIR" ]; then
    mkdir -p "$CERT_DIR"
fi

cd "$CERT_DIR"

# Helper function to check for commands
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 2 & 3. Install required tools (mkcert & openssl)
# Replaces the Chocolatey logic with apt/brew/curl logic
echo -e "${MAGENTA}Checking dependencies...${NC}"

if command_exists mkcert; then
    echo "mkcert is already installed."
else
    echo -e "${YELLOW}mkcert not found. Attempting installation...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install mkcert nss
        else
            echo -e "${RED}Homebrew not found. Please install mkcert manually or install Homebrew.${NC}"
            exit 1
        fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command_exists apt-get; then
            echo "Installing dependencies (libnss3-tools)..."
            sudo apt-get update && sudo apt-get install -y libnss3-tools curl
            elif command_exists yum; then
            sudo yum install -y nss-tools curl
        fi
        
        # Download binary directly from GitHub (Universal Linux approach)
        echo "Downloading mkcert binary..."
        curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
        chmod +x mkcert-v*-linux-amd64
        sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
    else
        echo -e "${RED}Unsupported OS. Please install 'mkcert' manually.${NC}"
        exit 1
    fi
fi

if ! command_exists openssl; then
    echo -e "${MAGENTA}Installing openssl...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install openssl
        elif command_exists apt-get; then
        sudo apt-get install -y openssl
    fi
fi

# 4. Initialize mkcert (The "Trust" step)
echo -e "${YELLOW}Setting up mkcert CA...${NC}"
mkcert -install

# 5. Generate Certificates
echo -e "${YELLOW}Generating Certificates...${NC}"
mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem $PUBLIC_HOSTNAME localhost 127.0.0.1 ::1  host.docker.internal
mkcert -key-file key.pem -cert-file cert.pem $PUBLIC_HOSTNAME localhost 127.0.0.1 ::1 host.docker.internal

# 6. Create Java Keystore
echo -e "${YELLOW}Creating Java Keystore...${NC}"
# Note: No 'cmd /c' needed here, openssl is native
openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret

# 7. Copy Root CA
echo -e "${YELLOW}Handling Root CA...${NC}"
CA_ROOT_PATH="$(mkcert -CAROOT)"
SOURCE_CA_FILE="$CA_ROOT_PATH/rootCA.pem"
TARGET_CA_FILE="$CERT_DIR/rootCA.pem"

if [ -f "$TARGET_CA_FILE" ]; then
    rm -f "$TARGET_CA_FILE"
fi

cp "$SOURCE_CA_FILE" "$TARGET_CA_FILE"

# 8. Verification
echo -e "\n${GREEN}DONE! Certificates generated successfully.${NC}"
ls -lh "$CERT_DIR"
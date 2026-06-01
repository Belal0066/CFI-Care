# Scripts 

> this readme file docments the scripts provided in this direct**or**y and the usage of each

<!-- To run a script , make sure to run them from their direct**or**y

```bash
cd ./
``` -->

All **bash** scripts use relative paths; run from this current `quick-run-scripts` directory or repo root

## System Start scripts

based on the host system you're using , pick the appropriate option:

### Linux Host (Bash)

[linux_friendly_start_containers.sh](./linux_friendly_start_containers.sh)

- linux desktop starter script

- sets `LOCAL_HOSTNAME` - used by external devices on the same LAN to make hostname dynamic and allow external users to connect to a locally running system
- runs `envsubst` to inject hostname into system files using existent templates
- detects Keycloak SPI's jars and invokes [`Init-system.sh`](./Init-system.sh) if jars are missing
- runs `generate_certs.sh` to automatically generate certs for dynamically changing local certs
- then opens terminal tabs to run each component's start script

- to run:

```bash
./linux_friendly_start_containers.sh 
```

### Windows (WSL  wrapper)
- launches Windows Terminal tabs that run the Linux start scripts inside WSL
- mirrors `linux_friendly..` script's behavior (template gen, jar-detection + [`Init-system.sh`](./Init-system.sh)), converts repo path to Windows format using wslpath, then opens WT tabs running the same component scripts under WSL

- to run, from WSL or git Bash:

```bash
./start_containers.sh
```

### Windows (Powershell)

- launches powershell terminal starter script
- sets `LOCAL_HOSTNAME`  - the hostname used by system to make hostname dynamic and allow external users to connect to a locally running system (first non-loopback IPv4), performs simple template substitution for ${LOCAL_HOSTNAME}, detects Keycloak jars, calls [`Init-system.ps1`](./Init_system.ps1) if jars missing (or falls back to [`Init-system.sh`](./Init-system.sh)), then launches Windows Terminal tabs that run docker compose in each component folder

- to run, from powershell:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_containers.ps1
```


## Component & helper scripts`

> 

- **Keycloak:** [./start_kc_containers.sh](./start_kc_containers.sh#L1)  
  - **Purpose:** Start Keycloak compose  
  - **Run:** 
    - linux
    ```bash
    ./start_kc_containers.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\start_kc_containers.ps1
    ```
  - **Notes:** May need realm imp**or**t commands; Init builds must produce plugin jars first.

- **NodeJS (backend):** [./start_nodejs_containers.sh](./start_nodejs_containers.sh#L1)  
  - **Purpose:** Start NodeJS compose and wait for redis/netw**or**k readiness  
   - **Run:** 
    - linux
    ```bash
    ./start_nodejs_containers.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\start_nodejs_containers.ps1
    ``` 
  - **Notes:** Waits for `redisSt**or**e` health; ensure netw**or**k/container names match

- **FHIR service:** [./start_fhir_container.sh](./start_fhir_container.sh#L1)  
  - **Purpose:** Start FHIR compose.  
  - **Run:** 
    - linux
    ```bash
    ./start_fhir_container.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\start_fhir_container.ps1
    ```  
  - **Notes:** none :D

- **Frontend:** [./start_frontend.sh](./start_frontend.sh#L1)  
  - **Purpose:** Start frontend compose  
  - **Run:** 
    - linux
    ```bash
    ./start_frontend.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\start_frontend.ps1
    ``` 
  - **Notes:** For local dev you can `cd frontend/src && ng serve` instead of compose

- **Nginx / reverse proxy:** [./start_nginx_containers.sh](./start_nginx_containers.sh#L1)  
  - **Purpose:** Start nginx compose  
  - **Run:** 
    - linux
    ```bash
    ./start_nginx_containers.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\start_nginx_containers.ps1
    ```  
  - **Notes:** check if containers fail to bind p**or**ts

- **Vault:** [./start_vault_container.sh](./start_vault_container.sh#L1)  
  - **Purpose:** Start Vault compose.  
  - **Run:** 
    - linux
    ```bash
    ./start_vault_container.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\start_vault_container.ps1
    ``` 
  - **Notes:** 
    - **Shared Vault:** set `VAULT_API_ADDR` to the Tailscale IP (or public hostname of the Vault host) before starting it
    - **Default:** if `VAULT_API_ADDR` is not set, Vault advertises `http://127.0.0.1:8200` for local dev :D

- **Stop / teardown:** [./stop_containers.sh](./stop_containers.sh#L1)  
  - **Purpose:** Bring down all compose stacks 
  - **Run:** 
    - linux
    ```bash
    ./stop_containers.sh
    ```
     **or** 
    
    - windows
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\stop_containers.ps1
    ``` 
  - **Notes:** none

- **Init (bash):** [./Init-system.sh](./Init-system.sh#L1)  
  - **Purpose:** Build Keycloak modules (mvn clean package) used by starter scripts when JARs missing
  - **Run:** `./Init-system.sh`  
  - **Notes:** May be slow, wrappers only call it if jars are absent

- **Init (PowerShell):** [./Init-system.ps1](./Init-system.ps1#L1)  
  - **Purpose:** PowerShell equivalent to build Keycloak jars (native mvn required)  
  - **Run:** `powershell -ExecutionPolicy Bypass -File .\quick-run-scripts\Init-system.ps1`.  
  - **Notes:** Fails fast if `mvn` not on PATH, wrappers will fallback to WSL init if needed

## Minimal prerequisites
- Docker + docker compose (or Docker Desktop) 
- Maven (`mvn`) for builds on windows.  
- envsubst (Linux/WSL) recommended for template expansion.  
- Windows Terminal (`wt.exe`) if using WT wrappers.  


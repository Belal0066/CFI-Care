# Security

## Table of Contents
1.
2. [Container Security & Consistency](#container-security--consistency)
   - [Privilege Escalation Controls](#container-security--consistency)
   - [Read-Only File System Policies](#container-security--consistency)
   - [Image Digest Verification](#image-digest-verification)
   - [Vulnerability Management (CVE Scanning)](#scan-the-image-for-cves)
3. [Core Services & Infrastructure](#services)
   - [Audit Dashboard (Grafana, Loki, Prometheus)](#audit-dashboard-grafana-loki-prometheus)
     - [Dashboards Visualization](#dashboards-display)
     - [Data Routing & Component Flow](#components--routing-flow)
     - [Grafana LogQL Panel Configuration](#grafana-logql-panel-configuration)
   - [Identity & Access Management (Keycloak)](#keycloak)
     - [FHIR Provisioner SPI Extension](#spis)
     - [Custom Email Verification SPI Extension](#spis)
     - [Automated Realm Configuration (Import/Export)](#realm-configuration-import--export) 
4. [Development & Cryptographic Provisioning](#for-dev-only)
   - [Local CA Generation & Trust Stores](#for-dev-only)

## System Design Diagrams

for planning related documents, check the `./Docs` directory's [readme](./Docs/readme.md) for an overview of each diagram

## Container security & Consistency

-  **Prevent In-Container Privilege Escalation:**

    All core services are locked down using kernel runtime safety flags to completely prevent child processes from gaining elevated permissions:
    ```yaml

    security_opt: 
        - no-new-privileges:true

    ```

- **Read-Only Mounting:**

    Mount host files read-only (`:ro`) where possible and only mount the minimal files your service needs (avoid mounting a unnecessary directories/files)

### Image Digest Verification


- To guard against malicious image mutations or upstream tag hijacking, production images are locked down via explicit cryptographically computed immutable SHA256 digests. 

    To pull and extract an immutable digest signature from a specific container tag, run:

    ```bash
    docker pull <image-name>:<tag>
    docker inspect --format='{{index .RepoDigests 0}}' <image-name>:<tag>
    ```

    sha256 digest will be in the output.
- for example :

    ```bash
    docker pull quay.io/oauth2-proxy/oauth2-proxy:7.12.0-alpine
    docker inspect --format='{{index .RepoDigests 0}}' quay.io/oauth2-proxy/oauth2-proxy:v7.12.0-alpine
    ```

### Scan the Image for CVEs

Static Application Security Testing (SAST) container binary scanning is enforced using Trivy: 

```
trivy image --severity HIGH,CRITICAL <image-name>:<tag>
```

## Services

### Audit Dashboard (Grafana, Loki, Prometheus)

> The platform implements a logging pipeline designed to guarantee the integrity, visibility, and immutability of security-critical actions (Authentication states, Patient Consent changes, and Data Access events)

- Accessible through `/graf` endpoint

#### Dashboards Visualization

![Grafana Human Readable Audit Trail](./Docs/screenshots/grafana_logs_panel.png)

![Grafana Real-time Metrics Dashboard](./Docs/screenshots/grafana_metrics_panel.png)

#### Components & Routing Flow

1. **Persistent Cache Layer (Redis):** Tracks auth states over the course of the last _90 days_ (TTL)
2. **Telemetry Collector (Grafana Loki Engine):** Serves as an immutable, low-overhead centralized indexing log engine
3. **Metrics Aggregator (Prometheus Engine):** Continuously pulls application state data over an internal collection loop
4. **Visual Analytics Gateway (Grafana Server):** Mounts data layers onto structural dashboards accessed via Nginx sub-routing (`/graf/`)

#### Grafana LogQL Panel Configuration

To make the raw JSON strings easily scannable on the security dashboard, the logs panel utilizes standard LogQL syntax parser filters to construct clean console output structures dynamically:

```
{source="redis-audit-db"}
| json
| line_format "[{{if .namespace}}{{.namespace}}{{else}}auth{{end}}] {{.eventType}} — User: {{if .userId}}{{.userId}}{{else if .email}}{{.email}}{{else}}system{{end}} | Details: {{if .patientId}}Patient ({{.patientId}}) -> {{.resourceType}} : {{.action}}{{else}}{{.reason}}{{end}} | [IP: {{.ip}} | ID: {{.requestId}}]"
```

### Firewall setup

- For firewall setup, i used a OPNsense virtualized environment in KVM, for exact steps check this [readme](./Firewall%20Config.md) out

![firewall dashboard](./Docs/screenshots/firewall/firewall-dashboard.png)
### Keycloak

> for manual steps in case you don't want to run scripts

#### SPIs

Custom Java Service Provider Interfaces (SPI) extend Keycloak to support automatic health record resource creation and advanced registration steps (email verification through otp instead of the keycloak default verification link)

- To build Keycloak **FHIR Provisioner SPI** (for at-registration resource creation) :

    ```bash
    cd security/Containers/services/keycloak/fhir-listener
    mvn clean package
    ```

- To build Keycloak custom **Email Verification Provider SPI** :

    ```bash
    cd security/Containers/services/keycloak/verify-email
    mvn clean package
    ```

#### Realm Configuration (Import / Export)

- To import keycloak realms automatically at local initialization, uncomment these lines within the main docker-compose in the keycloak container block:

  ```yml

  command:[
          ...

          # '-Dkeycloak.migration.action=import',
          # '-Dkeycloak.migration.provider=singleFile',
          # '-Dkeycloak.migration.realmName=CFI-Care',
          # '-Dkeycloak.migration.strategy=OVERWRITE_EXISTING',
          # '-Dkeycloak.migration.file=/import/realms.json',
          ...
    ]

  ```



- Alternatively, to manually make an active instance process a local volume data import block at runtime, run this command :

    ```bash
        docker exec -i kc.localhost  sh -c   "/opt/keycloak/bin/kc.sh import --file /opt/keycloak/data/import/realm.json"
    ```

- And to export a keycloak realm within a single file (also at runtime) :

    ```bash
        docker exec -i kc.localhost  sh -c  "/opt/keycloak/bin/kc.sh export --realm CFI-Care --file /export/realm.json"
    ```

## For dev only

- To generate signed local wildcard loopback certificates and map them directly into a Java standard tomcat pkcs12 trust store, run :

    ```bash
    mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem localhost kc.localhost 127.0.0.1 ::1

    mkcert -key-file key.pem -cert-file cert.pem localhost kc.localhost 127.0.0.1 ::1

    openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret

    cp $(mkcert -CAROOT)/rootCA.pem ./

    chmod 666 *.pem
    chmod 666 *.p12

    ```

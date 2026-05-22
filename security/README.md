# Security

## Container security & Consistency

- Prevent in-container privilege escalation (`security_opt: - no-new-privileges:true`)

- Mount host files read-only (`:ro`) where possible and only mount the minimal files your service needs (avoid mounting a unnecessary directories/files)

- To check digest or re-get it :

    ```
    docker pull <image-name>:<tag>
    docker inspect --format='{{index .RepoDigests 0}}' <image-name>:<tag>
    ```

    sha256 digest will be in the output.

    - for example :
      
            ```
            docker pull quay.io/oauth2-proxy/oauth2-proxy:7.12.0-alpine
            docker inspect --format='{{index .RepoDigests 0}}' quay.io/oauth2-proxy/oauth2-proxy:v7.12.0-alpine
            ```

- Scan the image for CVEs :

```
trivy image --severity HIGH,CRITICAL,MEDIUM <image-name>:<tag>
```



## Services


## Vault 

### For a Shared Vault over Tailscale


- Set `VAULT_API_ADDR` on the host to the Tailscale-reachable address
- Each machine should use its own auth path


### What Vault is used for here

- stores runtime secrets 
- Non-sensitive config stays in the constant `.env` files
- Vault Agents render per-service `.env` files under `/secret` paths on startup

### Bootstrap order

1. Start the Vault container
2. Unseal Vault
3. Log in with the root token (provided at vault init)
4. Write the AppRole policies into Vault
5. Create or refresh AppRole roles
6. Generate `secret_id` files for each service
7. Start the Vault Agent sidecars
8. Start the application containers

### Policies and roles

- `nodejs-policy` grants access to `secret/data/dev/nodejs/*`
- `oauth-policy` grants access to `secret/data/dev/oauth/*`
- `keycloak-policy` grants access to `secret/data/dev/keycloak/*`


### Secret ID handling

- `role_id` is stable and stored on disk (for local dev)
- `secret_id` is deleted after the sidecar consumes it
- for ease of dev, there's a script that regenrates `secret_id` at containers' startup ([vault_id_refresh.sh](../quick-run-scripts/vault_id_refresh.sh))
- Don't commit `role_id`, `secret_id`, vault token files, or unseal key(s)!

### Runtime file locations

- NodeJS vault agent renders its env file to `./secrets/kc/.env` in *backend* path
- Keycloak vault agent renders its env file to `./secrets/kc/.env.kc` in *security* path
- oauth2-proxy vault agent renders its env file to `./secrets/oauth/.env.oauth` in *security* path

### Example bootstrap commands

- authentication

```bash
export VAULT_ADDR=http://127.0.0.1:8200

vault status # to make sure vault is up and running, initialized
vault operator unseal <UNSEAL_KEY>
vault login <ROOT_TOKEN>

```
- policy setting

```bash
vault policy write nodejs-policy vault/policies/nodejs-policy.hcl
vault policy write oauth-policy vault/policies/oauth-policy.hcl
vault policy write keycloak-policy vault/policies/keycloak-policy.hcl

```

- app roles for authentication, policy checks (authorization?)

```bash
vault write auth/approle/role/nodejs-role \
  token_policies="nodejs-policy" \
  token_ttl="1h" \
  token_max_ttl="4h" \
  secret_id_ttl="24h" \
  secret_id_num_uses=10

vault write auth/approle/role/oauth-role \
  token_policies="oauth-policy" \
  token_ttl="1h" \
  token_max_ttl="4h" \
  secret_id_ttl="24h" \
  secret_id_num_uses=10

vault write auth/approle/role/keycloak-role \
  token_policies="keycloak-policy" \
  token_ttl="1h" \
  token_max_ttl="4h" \
  secret_id_ttl="24h" \
  secret_id_num_uses=10

```

- Output authentication keys (`role-id` ,`secret_id`)

```bash

vault read -field=role_id auth/approle/role/nodejs-role/role-id
vault write -f -field=secret_id auth/approle/role/nodejs-role/secret-id

vault read -field=role_id auth/approle/role/oauth-role/role-id
vault write -f -field=secret_id auth/approle/role/oauth-role/secret-id

vault read -field=role_id auth/approle/role/keycloak-role/role-id
vault write -f -field=secret_id auth/approle/role/keycloak-role/secret-id


```

- make sure `role-id` ,`secret_id` is in each agent's *role* directory before agent startup (found in `security/Containers/services/<container-name>/vault/role` withinn this project)

### Keycloak 

### JAR files generation

>for manual steps in case you don't want to run scripts
>jar generation script can be found at [Init-system.sh](../quick-run-scripts/Init-system.sh) or [Init_system.ps1](../quick-run-scripts/Init_system.ps1)

- To build Keycloak FHIR Provisioner (for at-registration resource creation) jar file :

```bash
cd security/Containers/services/keycloak/fhir-listener
mvn clean package
```

- To build Keycloak Verify email jar file :
  
```bash
cd security/Containers/services/keycloak/verify-email
mvn clean package
```

### realm import or export

- To import keycloak realms, either uncomment these lines within the main docker-compose in the keycloak container part(localhost):

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

    *or* run this command to import the file from its volume :
    
        ```
            docker exec -i kc.localhost  sh -c   "/opt/keycloak/bin/kc.sh import --file /import/realm.json"
        ```

- To export keycloak realms within a single file, start container, then run this command within a terminal :

<!--  docker exec -i kc.localhost  sh -c   "/opt/keycloak/bin/kc.sh export --file /export/realms.json" -->
        ```
            docker exec -i kc.localhost  sh -c  "/opt/keycloak/bin/kc.sh export --realm CFI-Care --file /export/realm.json"

        ```



## Cert generation (for dev only) 

> there should be a working script for this, [generate_certs.sh](../generate_certs.sh) or [generate_certs.ps1](../generate_certs.ps1)

- To set keycloak local certs in security/Containers/certs/ directory (chmod 644 so containers can read them) :

    ``` 
    mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem localhost kc.localhost 127.0.0.1 ::1

    mkcert -key-file key.pem -cert-file cert.pem localhost kc.localhost 127.0.0.1 ::1

    openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret

    cp $(mkcert -CAROOT)/rootCA.pem ./

    chmod 666 *.pem 
    chmod 666 *.p12
    
    ```


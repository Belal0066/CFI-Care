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
trivy image --severity HIGH,CRITICAL <image-name>:<tag>
```

## Services

### Keycloak

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
            docker exec -i localhost  sh -c   "/opt/keycloak/bin/kc.sh import --file /import/realms.json"
        ```

- To export keycloak realms within a single file, start container, then run this command within a terminal :

        ```
            docker exec -i localhost  sh -c   "/opt/keycloak/bin/kc.sh export --file /export/realms.json"

        ```



## For dev only 

- To set keycloak local certs in security/Containers/certs/ directory (chmod 644 so containers can read them) :

    ``` 
    mkcert -key-file keycloak-key.pem -cert-file keycloak-cert.pem localhost 127.0.0.1 ::1

    mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1

    openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name tomcat -password pass:secret

    cp $(mkcert -CAROOT)/rootCA.pem ./

    chmod 666 *.pem 
    
    ```




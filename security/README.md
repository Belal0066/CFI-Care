# Security

## Keycloak

### Container security & Consistency

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



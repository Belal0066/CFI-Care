package com.keycloak;

import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

public class FhirProvisioningEventListenerProviderFactory implements EventListenerProviderFactory {
    public static final String ID = "fhir-provisioner-listener";

    private ProvisioningHttpClient httpClient;

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new FhirProvisioningEventListenerProvider(session, httpClient);
    }

    @Override
    public void init(Config.Scope config) {
        String endpointUrl = config.get("endpoint-url");
        String tokenUrl = config.get("token-url");
        String clientId = config.get("client-id");
        String clientSecret = config.get("client-secret");
        int connectTimeoutMs = Integer.parseInt(config.get("connect-timeout-ms", "3000"));

        if (endpointUrl == null || tokenUrl == null || clientId == null || clientSecret == null) {
            // throw new IllegalStateException("Missing SPI config for " + ID);
            
            //  listener will load but remain inactive.
            System.err.println("[FHIR-listener] missing SPI config");
            this.httpClient = null;
            return;
        }

        this.httpClient = new ProvisioningHttpClient(
                endpointUrl, tokenUrl, clientId, clientSecret, connectTimeoutMs
        );
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {}

    @Override
    public void close() {}

    @Override
    public String getId() {
        return ID;
    }
}
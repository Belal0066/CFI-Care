package com.keycloak.email;

import org.keycloak.Config;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.services.resource.RealmResourceProvider;
import org.keycloak.services.resource.RealmResourceProviderFactory;

public class EmailCodeResourceProviderFactory implements RealmResourceProviderFactory {
    public static final String ID = "email-code";

    @Override
    public RealmResourceProvider create(KeycloakSession session) {
        return new EmailCodeResource(session);
    }

    @Override
    public String getId() { return "email-code"; }

    @Override public void init(Config.Scope config) {}
    @Override public void postInit(KeycloakSessionFactory factory) {}
    @Override public void close() {}
}
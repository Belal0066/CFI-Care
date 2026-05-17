package com.keycloak;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.services.resource.RealmResourceProvider;
import org.keycloak.email.EmailTemplateProvider;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.List;
import java.util.stream.Stream;
import org.keycloak.models.ClientModel;
import org.keycloak.services.managers.AuthenticationSessionManager;
import org.keycloak.sessions.AuthenticationSessionModel;


import org.keycloak.models.utils.ReadOnlyUserModelDelegate;

public class EmailCodeResource implements RealmResourceProvider {

    private static final org.jboss.logging.Logger logger = org.jboss.logging.Logger.getLogger(EmailCodeResource.class);
    private final KeycloakSession session;

    public EmailCodeResource(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public Object getResource() {
        return this;
    }

    protected AuthenticationSessionManager createAuthenticationSessionManager() {
        return new AuthenticationSessionManager(session);
    }

    @POST
    @Path("send")
    @Produces(MediaType.APPLICATION_JSON)
    public Response sendCode(@QueryParam("email") String email,
            @QueryParam("session_code") String sessionCode,
            @QueryParam("tab_id") String tabId,
            @QueryParam("client_id") String clientId) {
        try {
            RealmModel realm = session.getContext().getRealm();

           
            ClientModel client = realm.getClientByClientId(clientId);
            if (client == null) {
                return Response.status(400).entity("{\"error\":\"Invalid client_id\"}").build();
            }

            AuthenticationSessionManager asm = createAuthenticationSessionManager();
            AuthenticationSessionModel authSession = asm.getCurrentAuthenticationSession(realm, client, tabId);

            if (authSession == null) {
                return Response.status(401).entity("{\"error\":\"Session not found. Ensure cookies are enabled.\"}")
                        .build();
            }

            String code = String.format("%06d", new java.util.Random().nextInt(999999));
            authSession.setAuthNote("email-code", code);

            EmailTemplateProvider emailProvider = session.getProvider(EmailTemplateProvider.class);
            emailProvider.setRealm(realm);
            emailProvider.setUser(new DummyUser(email));

            Map<String, Object> attributes = new HashMap<>();
            attributes.put("code", code);

            emailProvider.send("emailVerificationSubject", "email-code-verification.ftl", attributes);

            return Response.ok("{\"status\":\"sent\"}").build();
        } catch (Exception e) {
            return Response.status(500).entity("{\"error\":\"" + e.getMessage() + "\"}").build();
        }
    }

    @Override
    public void close() {
    }

    private static class DummyUser extends ReadOnlyUserModelDelegate {
        private String email;

        public DummyUser(String email) {
            super(null);
            this.email = email;
        }

        @Override
        public String getEmail() {
            return email;
        }

        @Override
        public String getUsername() {
            return email;
        }

        @Override
        public Map<String, List<String>> getAttributes() {
            return new HashMap<>();
        }

        @Override
        public Stream<String> getAttributeStream(String name) {
            return Stream.empty();
        }

    }
}
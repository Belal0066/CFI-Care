package com.keycloak.email;

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
import java.util.List;
import java.util.stream.Stream;

import org.keycloak.models.utils.ReadOnlyUserModelDelegate;

public class EmailCodeResource implements RealmResourceProvider {

    private static final org.jboss.logging.Logger logger = org.jboss.logging.Logger.getLogger(EmailCodeResource.class);
    private static final String AUTH_NOTE_EMAIL_CODE = "email-code";
    private static final String AUTH_NOTE_EMAIL_ADDRESS = "email-code-email";
    private final KeycloakSession session;

    public EmailCodeResource(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public Object getResource() {
        return this;
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

            if (email == null || email.trim().isEmpty()) {
                return Response.status(400).entity("{\"error\":\"Email is required\"}").build();
            }

            org.keycloak.models.ClientModel client = realm.getClientByClientId(clientId);
            if (client == null) {
                return Response.status(400).entity("{\"error\":\"Invalid client_id\"}").build();
            }

            org.keycloak.services.managers.AuthenticationSessionManager asm = new org.keycloak.services.managers.AuthenticationSessionManager(
                    session);

            org.keycloak.sessions.AuthenticationSessionModel authSession = asm.getCurrentAuthenticationSession(realm,
                    client, tabId);

            if (authSession == null) {
                return Response.status(401).entity("{\"error\":\"Session not found. Ensure cookies are enabled.\"}")
                        .build();
            }

            String code = String.format("%06d", new java.util.Random().nextInt(999999));
            authSession.setAuthNote(AUTH_NOTE_EMAIL_CODE, code);
            authSession.setAuthNote(AUTH_NOTE_EMAIL_ADDRESS, email.trim());

            EmailTemplateProvider emailProvider = session.getProvider(EmailTemplateProvider.class);
            emailProvider.setRealm(realm);
            emailProvider.setUser(new DummyUser(email.trim()));

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

package com.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.Response;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.services.managers.AuthenticationSessionManager;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EmailCodeResourceTest {

    @Mock
    private KeycloakSession session;

    @Mock
    private KeycloakContext keycloakContext;

    @Mock
    private RealmModel realm;

    @Mock
    private ClientModel client;

    @Mock
    private AuthenticationSessionModel authSession;

    @Mock
    private EmailTemplateProvider emailTemplateProvider;

    @Test
    void secKcEmail001_invalidClientIdReturns400() {
        when(session.getContext()).thenReturn(keycloakContext);
        when(keycloakContext.getRealm()).thenReturn(realm);
        when(realm.getClientByClientId("bad-client")).thenReturn(null);

        EmailCodeResource resource = new EmailCodeResource(session);
        Response response = resource.sendCode("test@x.com", "s", "tab1", "bad-client");

        assertEquals(400, response.getStatus());
        assertTrue(String.valueOf(response.getEntity()).contains("Invalid client_id"));
    }

    @Test
    void secKcEmail002_missingSessionReturns401() {
        when(session.getContext()).thenReturn(keycloakContext);
        when(keycloakContext.getRealm()).thenReturn(realm);
        when(realm.getClientByClientId("good-client")).thenReturn(client);

        AuthenticationSessionManager asm = mock(AuthenticationSessionManager.class);
        when(asm.getCurrentAuthenticationSession(realm, client, "tab1")).thenReturn(null);

        EmailCodeResource resource = org.mockito.Mockito.spy(new EmailCodeResource(session));
        doReturn(asm).when(resource).createAuthenticationSessionManager();

        Response response = resource.sendCode("test@x.com", "s", "tab1", "good-client");

        assertEquals(401, response.getStatus());
        assertTrue(String.valueOf(response.getEntity()).contains("Session not found"));
    }

    @Test
    void secKcEmail003_004_005_successPathSendsCodeAndStoresAuthNote() throws Exception {
        when(session.getContext()).thenReturn(keycloakContext);
        when(keycloakContext.getRealm()).thenReturn(realm);
        when(realm.getClientByClientId("good-client")).thenReturn(client);
        when(session.getProvider(EmailTemplateProvider.class)).thenReturn(emailTemplateProvider);

        AuthenticationSessionManager asm = mock(AuthenticationSessionManager.class);
        when(asm.getCurrentAuthenticationSession(realm, client, "tab1")).thenReturn(authSession);

        EmailCodeResource resource = org.mockito.Mockito.spy(new EmailCodeResource(session));
        doReturn(asm).when(resource).createAuthenticationSessionManager();

        Response response = resource.sendCode("test@x.com", "s", "tab1", "good-client");

        assertEquals(200, response.getStatus());
        verify(authSession).setAuthNote(eq("email-code"), argThat(code -> code != null && code.matches("\\d{6}")));
        verify(emailTemplateProvider).setRealm(realm);
        verify(emailTemplateProvider).setUser(any());
        verify(emailTemplateProvider).send(
                eq("emailVerificationSubject"),
                eq("email-code-verification.ftl"),
                argThat((Map<String, Object> attrs) -> {
                    Object code = attrs.get("code");
                    return code instanceof String && ((String) code).matches("\\d{6}");
                })
        );
    }
}
package com.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

public class EmailCodeAuthenticator implements Authenticator {

    private static final String AUTH_NOTE_EMAIL_CODE = "email-code";

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();

        String code = String.format("%06d", new java.util.Random().nextInt(999999));
        context.getAuthenticationSession().setAuthNote(AUTH_NOTE_EMAIL_CODE, code);

        try {
            RealmModel realm = context.getRealm();
            EmailTemplateProvider emailProvider = context.getSession().getProvider(EmailTemplateProvider.class);
            Map<String, Object> attributes = new HashMap<>();
            attributes.put("code", code);

            emailProvider
                    .setAuthenticationSession(context.getAuthenticationSession())
                    .setRealm(realm)
                    .setUser(user)
                    .send("emailCodeSubject", "email-code-verification.ftl", attributes);

        } catch (EmailException e) {
            e.printStackTrace();
            Response challenge = context.form()
                    .setExecution(context.getExecution().getId()) // <--- INJECTS ACTIVE STEP CODE
                    .setError("Unable to send verification code email.")
                    .createForm("email-code-form.ftl");
            context.challenge(challenge);
            return;
        }

        // Native injection anchors for the verification form target
        Response challenge = context.form()
                .setExecution(context.getExecution().getId()) // <--- PASSES SYSTEM STATE TO FTL
                .createForm("email-code-form.ftl");
        context.challenge(challenge);
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String submittedCode = formData.getFirst("email_code");
        String expectedCode = context.getAuthenticationSession().getAuthNote(AUTH_NOTE_EMAIL_CODE);

        if (submittedCode == null || expectedCode == null || !expectedCode.equals(submittedCode.trim())) {
            Response challenge = context.form()
                    .setExecution(context.getExecution().getId()) // <--- MAINTAINS CONTEXT CONTEXT ON FAILURE
                    .setAttribute("username", context.getUser().getUsername())
                    .setError("Invalid verification code. Please try again.")
                    .createForm("email-code-form.ftl");
            context.challenge(challenge);
            return;
        }

        context.getUser().setEmailVerified(true);
        context.getUser().setEnabled(true);
        context.success();
    }

    @Override
    public boolean requiresUser() {
        return true;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
    }

    @Override
    public void close() {
    }
}
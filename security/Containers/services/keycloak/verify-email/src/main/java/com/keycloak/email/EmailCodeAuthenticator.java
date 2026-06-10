package com.keycloak.email;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import java.util.HashMap;
import java.util.Map;

public class EmailCodeAuthenticator implements Authenticator {

    private static final String AUTH_NOTE_EMAIL_CODE = "email-code";

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();

        // if the user already verified their email, skip this step
        if (user != null && user.isEmailVerified()) {
            context.success();
            return;
        }

        String existingCode = context.getAuthenticationSession().getAuthNote(AUTH_NOTE_EMAIL_CODE);

        // If code already exists in this session, don't send a new email to avoid
        // sending on each refresh
        if (existingCode != null) {
            Response challenge = context.form()
                    .setExecution(context.getExecution().getId())
                    .createForm("email-code-form.ftl");
            context.challenge(challenge);
            return;
        }

        sendAndChallenge(context, null);
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        MultivaluedMap<String, String> queryParams = context.getSession().getContext().getUri().getQueryParameters();
        boolean isResendRequest = queryParams != null && "true".equalsIgnoreCase(queryParams.getFirst("resend"));

        if (isResendRequest) {
            sendAndChallenge(context, "A fresh verification code has been dispatched to your email address.");
            return;
        }

        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String submittedCode = formData != null ? formData.getFirst("email_code") : null;
        String expectedCode = context.getAuthenticationSession().getAuthNote(AUTH_NOTE_EMAIL_CODE);

        if (submittedCode == null || expectedCode == null || !expectedCode.equals(submittedCode.trim())) {
            Response challenge = context.form()
                    .setExecution(context.getExecution().getId())
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

    // Isolated helper to safely generate a code, send it, and return a clean form
    // render challenge
    private void sendAndChallenge(AuthenticationFlowContext context, String successMessage) {
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
                    .setExecution(context.getExecution().getId())
                    .setError("Unable to send verification code email.")
                    .createForm("email-code-form.ftl");
            context.challenge(challenge);
            return;
        }

        var formProvider = context.form().setExecution(context.getExecution().getId());
        if (successMessage != null) {
            formProvider.setSuccess(successMessage);
        }

        context.challenge(formProvider.createForm("email-code-form.ftl"));
    }

    @Override
    public boolean requiresUser() {
        return true;
    }

    @Override
    public boolean configuredFor(KeycloakSession s, RealmModel r, UserModel u) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession s, RealmModel r, UserModel u) {
    }

    @Override
    public void close() {
    }
}
package com.keycloak.email;

import jakarta.ws.rs.core.MultivaluedMap;
import org.keycloak.authentication.FormAction;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;
import org.keycloak.policy.PasswordPolicyManagerProvider;
import org.keycloak.policy.PolicyError;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.email.EmailException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;
import java.util.regex.Pattern;

public class EmailCodeFormAction implements FormAction {

    private static final String AUTH_NOTE_EMAIL_CODE = "email-code";
    private static final String AUTH_NOTE_EMAIL_ADDRESS = "email-code-email";
    private static final String AUTH_NOTE_OTP_STEP = "otp-step";

    // email validation regex
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$",
            Pattern.CASE_INSENSITIVE);

    @Override
    public void buildPage(FormContext context, LoginFormsProvider form) {
        // Nothing
    }

    @Override
    public void validate(ValidationContext context) {
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        AuthenticationSessionModel authSession = context.getAuthenticationSession();
        String otpStep = formData != null ? formData.getFirst("otp_step") : null;
        boolean isOtpStep = "true".equalsIgnoreCase(otpStep);

        if (!isOtpStep) {
            authSession.removeAuthNote(AUTH_NOTE_EMAIL_CODE);
            authSession.removeAuthNote(AUTH_NOTE_OTP_STEP);
        }

        if (isOtpStep) {
            String existingCode = authSession.getAuthNote(AUTH_NOTE_EMAIL_CODE);
            String submitted = formData != null ? formData.getFirst("email_code") : null;

            if (existingCode == null) {
                context.validationError(formData,
                        Collections.singletonList(new FormMessage("email_code",
                                "Verification session is missing. Please request a new code.")));
                return;
            }

            if (submitted == null || !existingCode.equals(submitted.trim())) {
                context.validationError(formData,
                        Collections.singletonList(new FormMessage("email_code", "Invalid verification code.")));
                return;
            }

            context.success();
            return;
        }

        // reg details validation
        List<FormMessage> errors = new ArrayList<>();
        KeycloakSession session = context.getSession();
        RealmModel realm = session.getContext().getRealm();

        String firstName = firstNonNull(formData, "firstName");
        String lastName = firstNonNull(formData, "lastName");
        String email = firstNonNull(formData, "email");
        String username = realm.isRegistrationEmailAsUsername() ? email : firstNonNull(formData, "username");
        String password = firstNonNull(formData, "password");
        String passwordConfirm = firstNonNull(formData, "password-confirm");

        if (isBlank(firstName))
            errors.add(new FormMessage("firstName", "First name is required."));
        if (isBlank(lastName))
            errors.add(new FormMessage("lastName", "Last name is required."));
        if (isBlank(email))
            errors.add(new FormMessage("email", "Email is required."));
        if (isBlank(password))
            errors.add(new FormMessage("password", "Password is required."));
        if (isBlank(passwordConfirm))
            errors.add(new FormMessage("password-confirm", "Password confirmation is required."));

        if (!errors.isEmpty()) {
            context.validationError(formData, errors);
            return;
        }

        if (!EMAIL_PATTERN.matcher(email.trim()).matches()) {
            context.validationError(formData,
                    Collections.singletonList(new FormMessage("email", "Invalid email address format.")));
            return;
        }

        if (!password.equals(passwordConfirm)) {
            context.validationError(formData,
                    Collections.singletonList(new FormMessage("password-confirm", "Passwords do not match.")));
            return;
        }

        PasswordPolicyManagerProvider policyManager = session.getProvider(PasswordPolicyManagerProvider.class);
        if (policyManager != null) {
            PolicyError policyError = policyManager.validate(realm, new DummyUser(email.trim()), password);
            if (policyError != null) {
                context.validationError(formData,
                        Collections.singletonList(new FormMessage("password", policyError.getMessage())));
                return;
            }
        }

        if (session.users().getUserByUsername(realm, username) != null) {
            context.validationError(formData,
                    Collections.singletonList(new FormMessage("username", "Username already exists.")));
            return;
        }

        if (session.users().getUserByEmail(realm, email) != null) {
            context.validationError(formData,
                    Collections.singletonList(new FormMessage("email", "Email address already registered.")));
            return;
        }

        // checks passed
        String code = generateCode();
        authSession.setAuthNote(AUTH_NOTE_EMAIL_CODE, code);
        authSession.setAuthNote(AUTH_NOTE_EMAIL_ADDRESS, email.trim());
        authSession.setAuthNote(AUTH_NOTE_OTP_STEP, "true");

        try {
            sendVerificationEmail(context, email.trim(), code);
        } catch (EmailException e) {
            e.printStackTrace();
            context.validationError(formData,
                    Collections.singletonList(new FormMessage("email", "Unable to send verification code.")));
            return;
        }

        context.validationError(formData, Collections
                .singletonList(new FormMessage("email_code", "Verification code sent to your email address.")));
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String firstNonNull(MultivaluedMap<String, String> m, String key) {
        return (m == null) ? null : m.getFirst(key);
    }

    private void sendVerificationEmail(ValidationContext context, String email, String code) throws EmailException {
        RealmModel realm = context.getSession().getContext().getRealm();
        EmailTemplateProvider emailProvider = context.getSession().getProvider(EmailTemplateProvider.class);

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("code", code);

        emailProvider
                .setAuthenticationSession(context.getAuthenticationSession())
                .setRealm(realm)
                .setUser(new DummyUser(email))
                .send("emailCodeSubject", "email-code-verification.ftl", attributes);
    }

    private String generateCode() {
        return String.format("%06d", new java.util.Random().nextInt(999999));
    }

    @Override
    public void success(FormContext context) {
        // UserModel user = context.getUser();
        // if (user != null) {
        // user.setEmailVerified(true);
        // }

        // AuthenticationSessionModel authSession = context.getAuthenticationSession();
        // if (authSession != null) {
        // authSession.removeAuthNote(AUTH_NOTE_EMAIL_CODE);
        // authSession.removeAuthNote(AUTH_NOTE_EMAIL_ADDRESS);
        // authSession.removeAuthNote(AUTH_NOTE_OTP_STEP);
        // }
    }

    @Override
    public boolean requiresUser() {
        return false;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // no-op
    }

    @Override
    public void close() {
    }

    private static class DummyUser extends org.keycloak.models.utils.ReadOnlyUserModelDelegate {
        private final String email;

        DummyUser(String email) {
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
        public java.util.stream.Stream<String> getAttributeStream(String name) {
            return java.util.stream.Stream.empty();
        }
    }
}
package com.keycloak.email;

import org.keycloak.Config;
import org.keycloak.authentication.FormAction;
import org.keycloak.authentication.FormActionFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;
import java.util.List;

public class EmailCodeFormActionFactory implements FormActionFactory {
    @Override
    public String getDisplayType() { return "Registration Email Code Verification"; }
    @Override
    public String getReferenceCategory() { return "email-verification"; }
    @Override
    public boolean isConfigurable() { return false; }
    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[] { AuthenticationExecutionModel.Requirement.REQUIRED };
    }
    @Override
    public boolean isUserSetupAllowed() { return false; }
    @Override
    public String getHelpText() { return "Verifies email via code during registration"; }
    @Override
    public List<ProviderConfigProperty> getConfigProperties() { return null; }
    @Override
    public FormAction create(KeycloakSession session) { return new EmailCodeFormAction(); }
    @Override
    public void init(Config.Scope config) {}
    @Override
    public void postInit(KeycloakSessionFactory factory) {}
    @Override
    public void close() {}
    @Override
    public String getId() { return "registration-email-code-action"; }
}
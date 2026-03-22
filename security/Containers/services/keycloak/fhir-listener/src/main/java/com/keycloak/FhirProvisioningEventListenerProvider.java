// filepath: /home/salma/Desktop/CFI-Care/keycloak-fhir-listener/src/main/java/com/cficare/keycloak/FhirProvisioningEventListenerProvider.java
package com.keycloak;

import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

public class FhirProvisioningEventListenerProvider implements EventListenerProvider {
    private final KeycloakSession session;
    private final ProvisioningHttpClient client;

    public FhirProvisioningEventListenerProvider(KeycloakSession session, ProvisioningHttpClient client) {
        this.session = session;
        this.client = client;
    }

    @Override
    public void onEvent(Event event) {
        if (event.getType() != EventType.REGISTER) return;

        RealmModel realm = session.realms().getRealm(event.getRealmId());
        if (realm == null) return;

        UserModel user = session.users().getUserById(realm, event.getUserId());
        if (user == null) return;

        String firstName = user.getFirstName();
        String lastName = user.getLastName();
        String fullName = ((firstName == null ? "" : firstName) + " " + (lastName == null ? "" : lastName)).trim();

        client.sendRegisterEvent(
                event.getUserId(),
                user.getEmail(),
                firstName,
                lastName,
                fullName,
                event.getClientId()
        );
    }

    @Override
    public void onEvent(AdminEvent adminEvent, boolean includeRepresentation) {
        
    }

    @Override
    public void close() {
        
    }
}
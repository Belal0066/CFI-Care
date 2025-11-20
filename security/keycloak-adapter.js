import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
    url: "https://kc.localhost:8443/",
    realm: "CFI-Care",
    clientId: "hapi-fhir"
});

try {
    const authenticated = await keycloak.init({
    onLoad: 'login-required',
    // silentCheckSsoRedirectUri: `${location.origin}/silent-check-sso.html`
});
    if (authenticated) {
        console.log('User is authenticated');
    } else {
        console.log('User is not authenticated');
    }
} catch (error) {
    console.error('Failed to initialize adapter:', error);
}
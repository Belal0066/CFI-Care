//local dev stuff , can be overriden by env file (see readme) especially if you want to run from an external device

class AppConfig {
  // backend APIs :D
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );

  // Keycloak
  static const keycloakIssuer = String.fromEnvironment(
    'KEYCLOAK_ISSUER',
    defaultValue: 'https://localhost:8443/keycloak/realms/CFI-Care',
  );

  static const keycloakClientId = String.fromEnvironment(
    'KEYCLOAK_CLIENT_ID',
    defaultValue: 'flutter-app',
  );

  static const keycloakRedirectUri = String.fromEnvironment(
    'KEYCLOAK_REDIRECT_URI',
    defaultValue: 'com.example.medflow:/oauthredirect',
  );

  static const keycloakPostLogoutRedirectUri = String.fromEnvironment(
    'KEYCLOAK_POST_LOGOUT_REDIRECT_URI',
    defaultValue: 'com.example.medflow:/logoutredirect',
  );
}

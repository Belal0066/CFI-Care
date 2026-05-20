class AppConfigValues {
  static const apiBaseUrl = 'http://${PUBLIC_HOSTNAME}:3000/api';
  static const keycloakIssuer =
      'https://${PUBLIC_HOSTNAME}/keycloak/realms/CFI-Care';
  static const keycloakClientId = 'flutter-app';
  static const keycloakRedirectUri = 'com.example.medflow:/oauthredirect';
  static const keycloakPostLogoutRedirectUri =
      'com.example.medflow:/logoutredirect';
}
class AppConfigValues {
  static const apiBaseUrl = 'http://192.168.1.2:3000/api';
  static const keycloakIssuer =
      'https://192.168.1.2:8443/keycloak/realms/CFI-Care';
  static const keycloakClientId = 'flutter-app';
  static const keycloakRedirectUri = 'com.example.medflow:/oauthredirect';
  static const keycloakPostLogoutRedirectUri =
      'com.example.medflow:/logoutredirect';
}
class AppConfigValues {
  static const apiBaseUrl = 'http://192.168.100.52:3000/api';
  static const keycloakIssuer =
      'https://192.168.100.52/keycloak/realms/CFI-Care';
  static const keycloakClientId = 'flutter-app';
  static const keycloakRedirectUri = 'com.example.medflow:/oauthredirect';
  static const keycloakPostLogoutRedirectUri =
      'com.example.medflow:/logoutredirect';
  static const docOnFhirBaseUrl = 'http://100.117.76.20:8001';
}


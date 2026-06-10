import 'app_config.dart';

class KeycloakAuthConfig {
  final String issuer;
  final String clientId;
  final String redirectUri;
  final String postLogoutRedirectUri;
  final List<String> scopes;

  const KeycloakAuthConfig({
    required this.issuer,
    required this.clientId,
    required this.redirectUri,
    required this.postLogoutRedirectUri,
    this.scopes = const ['openid', 'profile', 'email', 'offline_access'],
  });

  String get discoveryUrl => '$issuer/.well-known/openid-configuration';
}

class AppAuthConfig {
  static const keycloak = KeycloakAuthConfig(
    issuer: AppConfig.keycloakIssuer,
    clientId: AppConfig.keycloakClientId,
    redirectUri: AppConfig.keycloakRedirectUri,
    postLogoutRedirectUri: AppConfig.keycloakPostLogoutRedirectUri,
  );
}

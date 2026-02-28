import '../../domain/repository/auth_repo.dart';
import '../../domain/models/auth_model.dart';
import '../services/datasources/keycloak_remote_data_source.dart';

class AuthenticationRepoImpl implements AuthenticationRepository {
  final KeycloakRemoteDataSource datasource;
  AuthenticationRepoImpl({required this.datasource});
  @override
  Future<AuthModel> login() {
    return datasource.login();
  }

  @override
  Future<AuthModel?> restoreSession() {
    return datasource.restoreSession();
  }

  @override
  Future<AuthModel> refreshSession() {
    return datasource.refreshSession();
  }

  @override
  Future<void> logout() {
    return datasource.logout();
  }

  @override
  Future<String?> getValidAccessToken() async {
    final restored = await restoreSession();

    if (restored == null) return null;

    if (!restored.isAccessTokenExpired) {
      return restored.accessToken;
    } else {
      final refreshed = await refreshSession();
      return refreshed.accessToken;
    }
  }

  @override
  Future<AuthModel> runKeycloakAction(String action) {
    return datasource.runKeycloakAction(action);
  }

  @override
  Future<AuthModel> updatePassword() {
    return datasource.runKeycloakAction('UPDATE_PASSWORD');
  }

  // @override
  // Future<bool> register(String fName, String lName , String email, String pass) async{
  //     return datasource.register(fName, lName, email , pass);
  // }

  // @override
  // Future<AuthenticationModel> login(String email, String pass) async{
  //     return datasource.login(email, pass);
  // }

  // @override
  // Future <bool> logout() async{
  //     return datasource.logout();
  // }
  // @override
  // Future <AuthenticationModel> refreshToken(String refreshToken)async{
  //     return datasource.refreshtoken(refreshToken);
  // }
}

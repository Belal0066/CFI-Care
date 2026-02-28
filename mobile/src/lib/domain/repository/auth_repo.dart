import '../models/auth_model.dart';

abstract class AuthenticationRepository {
  Future<AuthModel> login();
  Future<AuthModel?> restoreSession();
  Future<AuthModel> refreshSession();
  Future<void> logout();
  Future<String?> getValidAccessToken();

  // Future<AuthModel> login(String email, String pass);
  // Future<bool> register(String fName, String lName , String email, String pass);
  // Future <bool> logout();
  // Future <AuthModel> refreshToken(String refreshToken);
}

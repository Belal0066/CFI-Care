import '../../domain/repository/auth_repo.dart';
import '../../domain/models/auth_model.dart';

class AuthUsecases {
  final AuthenticationRepository repo;
  AuthUsecases({required this.repo});

  Future<AuthModel> login() => repo.login();

  Future<AuthModel?> restoreSession() => repo.restoreSession();

  Future<AuthModel> refreshSession() => repo.refreshSession();

  Future<void> logout() => repo.logout();

  Future<String?> getValidAccessToken() => repo.getValidAccessToken();

  // Future<AuthenticationModel> login(String email, String pass) async{
  //     return repo.login(email, pass);
  // }
  // Future<bool> register(String fName, String lName , String email, String pass)async{
  //     return repo.register(fName, lName, email, pass);
  // }
  // Future <bool> logout() async{
  //     return repo.logout();
  // }
  // Future <AuthenticationModel> refreshToken(String refreshToken) async{
  //     return repo.refreshToken(refreshToken);
  // }
}

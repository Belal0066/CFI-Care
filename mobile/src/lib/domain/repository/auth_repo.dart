import '../models/auth_model.dart';
abstract class AuthenticationRepository{
    Future<AuthenticationModel> login(String email, String pass);
    Future<bool> register(String fName, String lName , String email, String pass);
    Future <bool> logout();
    Future <AuthenticationModel> refreshToken(String refreshToken);
}
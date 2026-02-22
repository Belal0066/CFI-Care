import '../../domain/repository/auth_repo.dart';
import '../../domain/models/auth_model.dart';
import '../services/datasources/keycloak_remote_data_source.dart';



class AuthenticationRepoImpl implements AuthenticationRepository{
    final KeycloakRemoteDataSource datasource;
    AuthenticationRepoImpl({required this.datasource});
    @override
    Future<bool> register(String fName, String lName , String email, String pass) async{
        return datasource.register(fName, lName, email , pass);
    }

    @override
    Future<AuthenticationModel> login(String email, String pass) async{
        return datasource.login(email, pass);
    }
    
    @override
    Future <bool> logout() async{
        return datasource.logout();
    }
    @override
    Future <AuthenticationModel> refreshToken(String refreshToken)async{
        return datasource.refreshtoken(refreshToken);
    }
}
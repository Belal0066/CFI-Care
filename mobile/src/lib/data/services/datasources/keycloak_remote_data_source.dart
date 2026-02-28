// import 'package:http/http.dart' as http;
import '../../../domain/models/auth_model.dart';
// import 'dart:convert';

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:jwt_decoder/jwt_decoder.dart';

import '../../../config/keycloak_config.dart';
import 'secure_token_local_data_source.dart';

class KeycloakRemoteDataSource {
  final FlutterAppAuth _appAuth;
  final KeycloakAuthConfig _config;
  final TokenVault _vault;

  KeycloakRemoteDataSource({
    FlutterAppAuth? appAuth,
    KeycloakAuthConfig? config,
    TokenVault? vault,
  }) : _appAuth = appAuth ?? const FlutterAppAuth(),
       _config = config ?? AppAuthConfig.keycloak,
       _vault = vault ?? TokenVault();

  Future<AuthModel> login() async {
    try {
      final AuthorizationTokenResponse? response = await _appAuth
          .authorizeAndExchangeCode(
            AuthorizationTokenRequest(
              _config.clientId,
              _config.redirectUri,
              issuer: _config.issuer,
              scopes: _config.scopes,
            ),
          );

      final refresh = response?.refreshToken;

      // final access = response?.accessToken ?? '';

      // print('[AUTH DEBUG] access exists=${access.isNotEmpty}');
      // print(
      //   '[AUTH DEBUG] refresh is null=${refresh == null}, empty=${(refresh ?? '').isEmpty}',
      // );
      // print('[AUTH DEBUG] id exists=${(response?.idToken ?? '').isNotEmpty}');
      // print(
      //   '[AUTH DEBUG] access exp=${response?.accessTokenExpirationDateTime}',
      // );
      // print('[AUTH DEBUG] token type=${response?.tokenType}');

      if (refresh == null || refresh.isEmpty) {
        throw Exception('Login succeeded but no refresh token was returned. ');
      }

      if (response == null || response.accessToken == null) {
        throw Exception('Auth falied: empty token res');
      }

      await _saveTokens(
        accessToken: response.accessToken!,
        refreshToken: refresh,
        idToken: response.idToken,
      );

      // final savedRefresh = await _vault.readRefreshToken();
      // print(
      //   '[AUTH DEBUG] saved refresh null=${savedRefresh == null}, empty=${(savedRefresh ?? '').isEmpty}, len=${savedRefresh?.length ?? 0}',
      // );

      return _mapToSession(
        accessToken: response.accessToken!,
        refreshToken: refresh,
        idToken: response.idToken,
        expiresAt: response.accessTokenExpirationDateTime,
      );
    } on FlutterAppAuthUserCancelledException {
      throw Exception('Login cancelled by user');
    }
  }

  Future<AuthModel> refreshSession({String? refreshToken}) async {
    final tokenToUse = refreshToken ?? await _vault.readRefreshToken();
    if (tokenToUse == null || tokenToUse.isEmpty) {
      throw Exception('no refresh token found');
    }

    final TokenResponse? response = await _appAuth.token(
      TokenRequest(
        _config.clientId,
        _config.redirectUri,
        issuer: _config.issuer,
        refreshToken: tokenToUse,
        scopes: _config.scopes,
      ),
    );

    if (response == null || response.accessToken == null) {
      throw Exception('Token refresh failed: empty response');
    }

    final newRefresh = response.refreshToken ?? tokenToUse;

    await _saveTokens(
      accessToken: response.accessToken!,
      refreshToken: newRefresh,
      idToken: response.idToken,
    );

    return _mapToSession(
      accessToken: response.accessToken!,
      refreshToken: newRefresh,
      idToken: response.idToken,
      expiresAt: response.accessTokenExpirationDateTime,
    );
  }

  Future<AuthModel?> restoreSession() async {
    final access = await _vault.readAccessToken();
    final refresh = await _vault.readRefreshToken();
    final id = await _vault.readIdToken();

    if (access == null || access.isEmpty) return null;

    final session = _mapToSession(
      accessToken: access,
      refreshToken: refresh,
      idToken: id,
      expiresAt: null,
    );

    if (!session.isAccessTokenExpired) return session;

    if (refresh == null || refresh.isEmpty) return null;

    return refreshSession(refreshToken: refresh);
  }

  Future<void> logout() async {
    try {
      final idToken = await _vault.readIdToken();
      if (idToken != null && idToken.isNotEmpty) {
        await _appAuth.endSession(
          EndSessionRequest(
            idTokenHint: idToken,
            postLogoutRedirectUrl: _config.postLogoutRedirectUri,
            issuer: _config.issuer,
          ),
        );
      }
    } finally {
      await _vault.clear();
    }
  }

  Future<void> _saveTokens({
    required String accessToken,
    required String? refreshToken,
    required String? idToken,
  }) async {
    await _vault.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken ?? '',
      idToken: idToken,
    );
  }

  AuthModel _mapToSession({
    required String accessToken,
    required String? refreshToken,
    required String? idToken,
    required DateTime? expiresAt,
  }) {
    final sourceToken = (idToken != null && idToken.isNotEmpty)
        ? idToken
        : accessToken;
    final claims = JwtDecoder.decode(sourceToken);

    final exp =
        expiresAt ??
        DateTime.fromMillisecondsSinceEpoch(
          ((claims['exp'] ?? 0) as int) * 1000,
        );

    final sub = (claims['sub'] as String?) ?? '';
    if (sub.isEmpty) {
      throw Exception('invalid token:subject missing');
    }

    return AuthModel(
      accessToken: accessToken,
      refreshToken: refreshToken,
      idToken: idToken,
      expiresAt: exp,
      subject: sub,
      email: claims['email'] as String?,
      name: claims['name'] as String?,
    );
  }

  // Future<AuthenticationModel> login(String email, String pass) async{

  //     final url = Uri.parse('mobile-login');
  //     final headers = {'Content-Type': 'application/json'};
  //     final body = jsonEncode({'email': email, 'password': pass});

  //     final response = await http.post(url, headers: headers, body: body);

  //     if (response.statusCode == 200) {
  //         var data = jsonDecode(response.body);
  //         // print(data);
  //         return AuthenticationModel.fromJson(data);
  //     } else if(response.statusCode==400){
  //         throw Exception('Invalid credentails , please try again');
  //     } else{
  //         throw Exception('Failed to login');

  //     }
  // }

  // Future <bool> register(String fName, String lName , String email, String pass) async{
  //     final url = Uri.parse('mobile-register');
  //     final headers = {'Content-Type': 'application/json'};
  //     final body = jsonEncode({'email': email, 'password': pass , 'firstName': fName , 'lastName' : lName});

  //     final response = await http.post(url, headers: headers, body: body);

  //     if (response.statusCode == 200) {
  //         var data = jsonDecode(response.body);
  //         return jsonDecode(data);
  //     }
  //      else if(response.statusCode==400){
  //         throw Exception('user already exists');
  //     }
  //     else {
  //         throw Exception('Registrastion failed');
  //     }

  // }

  // Future <bool> logout() async{
  //     final url = Uri.parse('mobile-logout');
  //     final headers = {'Content-Type': 'application/json'};
  //     final response = await http.post(url, headers: headers);

  //     if (response.statusCode == 200) {
  //         return true;
  //     } else {
  //         throw Exception('Logout failed');
  //     }
  // }

  // Future <AuthenticationModel> refreshtoken(String refreshtoken) async{
  //     final url = Uri.parse('refresh');
  //     final headers = {'Content-Type': 'application/json'};
  //     final body = jsonEncode({'refresh_token': refreshtoken});
  //     final response = await http.post(url, headers: headers, body: body);

  //     if (response.statusCode == 200) {
  //         var data = jsonDecode(response.body);
  //         return AuthenticationModel.fromJson(data);   // has so many null fields , will refactor :(
  //     } else {
  //         throw Exception('Refresh failed');
  //     }
  // }
}

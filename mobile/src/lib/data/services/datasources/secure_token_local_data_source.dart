import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:jwt_decoder/jwt_decoder.dart';

class TokenVault {
  static const _kAccess = 'kc_access_token';
  static const _kRefresh = 'kc_refresh_token';
  static const _kId = 'kc_id_token';

  static const _storage = FlutterSecureStorage();

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    String? idToken,
  }) async {
    await _storage.write(key: _kAccess, value: accessToken);
    await _storage.write(key: _kRefresh, value: refreshToken);
    if (idToken != null) {
      await _storage.write(key: _kId, value: idToken);
    }
  }

  Future<void> clear() async {
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kId);
  }

  //ma3rfsh func zay da mafrod fen :<
  Future<bool> isAccessExpired(TokenVault vault) async {
    final token = await vault.readAccessToken();
    if (token == null) return true;
    return JwtDecoder.isExpired(token);
  }

  Future<String?> readAccessToken() => _storage.read(key: _kAccess);
  Future<String?> readRefreshToken() => _storage.read(key: _kRefresh);
  Future<String?> readIdToken() => _storage.read(key: _kId);
}

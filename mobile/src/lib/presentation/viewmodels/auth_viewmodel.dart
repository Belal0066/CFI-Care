import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../database/db_helper.dart';
import '../../domain/models/auth_model.dart';
import '../../domain/usecases/auth_usecases.dart';

enum AuthStatus {
  unknown, // start up :o
  unauthenticated,
  authenticating, // ma3rfsh le lazma wala la, saybah 7alyan
  authenticated,
  refreshing,
  failure, // op failed
}

class AuthProvider with ChangeNotifier {
  final AuthUsecases _authUsecases;

  AuthProvider(this._authUsecases);

  AuthStatus _status = AuthStatus.unknown;
  AuthStatus get status => _status;

  AuthModel? _session;
  AuthModel? get session => _session;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  bool get isAuthenticated => _status == AuthStatus.authenticated;

  Future<void> init() async {
    _setState(AuthStatus.unknown);

    try {
      final restored = await _authUsecases.restoreSession();

      if (restored == null) {
        await _clearLocalSession();
        _setState(AuthStatus.unauthenticated);
        return;
      }

      _session = restored;

      final email = restored.email ?? '';

      await DBHelper.ensureUserAndProfile(
        userId: restored.subject,
        email: email,
        firstName: restored.name?.split(' ').first,
        lastName: (restored.name != null && restored.name!.contains(' '))
            ? restored.name!.split(' ').skip(1).join(' ')
            : null,
      );

      await _syncUserId(userId: restored.subject);


      _setState(AuthStatus.authenticated);
    // } catch (e) {
    //   _errorMessage = e.toString();
    //   await _clearLocalSession();
    //   _setState(AuthStatus.failure);
    //   _setState(AuthStatus.unauthenticated);
    // }

    } catch (e) {
      _errorMessage = e.toString();
      if (_isSessionRevokedError(e)) {
        await _clearLocalSession();
        _session = null;
        _setState(AuthStatus.unauthenticated);
      } else {
        _setState(AuthStatus.failure);
      }
    }
  }

  Future<void> login() async {
    if (_status == AuthStatus.authenticating ||
        _status == AuthStatus.refreshing) {
      return;
    }
    _errorMessage = null;
    _setState(AuthStatus.authenticating);

    try {
      final session = await _authUsecases.login();
      _session = session;

      final email = session.email ?? '';
     
      await DBHelper.ensureUserAndProfile(
        userId: session.subject,
        email: email,
        firstName: session.name?.split(' ').first,
        lastName: (session.name != null && session.name!.contains(' '))
            ? session.name!.split(' ').skip(1).join(' ')
            : null,
      );

      await _syncUserId(userId: session.subject);


      _setState(AuthStatus.authenticated);
    } catch (e) {
      _errorMessage = e.toString();
      _session = null;
      _setState(
        AuthStatus.failure,
      ); // removed next line because there was a looping problem :<
      // _setState(AuthStatus.unauthenticated);
    }
  }

  Future<void> logout() async {
    try {
      await _authUsecases.logout();
    } catch (e) {
      throw Exception('remote logout failed : ${e.toString()}');
    } finally {
      _session = null;
      await _clearLocalSession();
      _setState(AuthStatus.unauthenticated);
    }
  }

  Future<String?> getValidAccessToken() async {
    try {
      if (_session == null) {
        final restored = await _authUsecases.restoreSession();
        _session = restored;
      }

      if (_session == null) return null;

      if (_session!.isAccessTokenExpired) {
        _setState(AuthStatus.refreshing);
        final refreshed = await _authUsecases.refreshSession();
        _session = refreshed;
        await _syncUserId(
          userId: refreshed.subject
        );
        _setState(AuthStatus.authenticated);
      }

      return _session?.accessToken;
    } catch (e) {
      _errorMessage = e.toString();
      if (_isSessionRevokedError(e)) {
        _session = null;
        await _clearLocalSession();
        _setState(AuthStatus.unauthenticated);
      } else {
        _setState(AuthStatus.failure);
      }
      return null;
    }
  }

  void clearError() {
    _errorMessage = null;
    if (_status == AuthStatus.failure) {
      _setState(
        _session == null
            ? AuthStatus.unauthenticated
            : AuthStatus.authenticated,
      );
    } else {
      notifyListeners();
    }
  }

  void _setState(AuthStatus newStatus) {
    _status = newStatus;
    notifyListeners();
  }

  Future<void> _syncUserId({
    required String userId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('currentUserId', userId);
    Session.currentUserId = userId;
  }

  Future<void> _clearLocalSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('currentUserId');
    Session.currentUserId = null;
  }

  Future<void> configureTotp() async {
  final session = await _authUsecases.runKeycloakAction('CONFIGURE_TOTP');
  _session = session;
  _setState(AuthStatus.authenticated);
}

Future<void> updatePassword() async {
  final session = await _authUsecases.updatePassword();
  _session = session;
  _setState(AuthStatus.authenticated);
}

bool _isSessionRevokedError(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('invalid_grant') ||
        text.contains('token_failed') ||
        text.contains('session expired');
  }


}

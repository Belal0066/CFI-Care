import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:medflow/presentation/viewmodels/auth_viewmodel.dart';
import 'package:medflow/domain/usecases/auth_usecases.dart';
import 'package:medflow/domain/repository/auth_repo.dart';
import 'package:medflow/domain/models/auth_model.dart';
import 'package:medflow/database/db_helper.dart';

@GenerateMocks([AuthUsecases, AuthenticationRepository])
import 'auth_provider_test.mocks.dart';

// --- Dummy data helpers ---

AuthModel validSession({
  String subject = 'user-sub-1',
  String email = 'test@example.com',
  String name = 'Test User',
}) =>
    AuthModel(
      accessToken: 'access_token_123',
      refreshToken: 'refresh_token_123',
      subject: subject,
      email: email,
      name: name,
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
    );

AuthModel expiredSession() => AuthModel(
      accessToken: 'old_token',
      subject: 'user-sub-1',
      email: 'test@example.com',
      expiresAt: DateTime.now().subtract(const Duration(hours: 1)),
    );

void main() {
  // =========================================================================
  // AuthUsecases — delegation tests
  // =========================================================================
  group('AuthUsecases', () {
    late MockAuthenticationRepository mockRepo;
    late AuthUsecases usecases;

    setUp(() {
      mockRepo = MockAuthenticationRepository();
      usecases = AuthUsecases(repo: mockRepo);
    });

    test('login() delegates to repo.login()', () async {
      when(mockRepo.login()).thenAnswer((_) async => validSession());
      final result = await usecases.login();
      verify(mockRepo.login()).called(1);
      expect(result.subject, 'user-sub-1');
    });

    test('restoreSession() delegates to repo.restoreSession()', () async {
      when(mockRepo.restoreSession()).thenAnswer((_) async => null);
      final result = await usecases.restoreSession();
      verify(mockRepo.restoreSession()).called(1);
      expect(result, null);
    });

    test('refreshSession() delegates to repo.refreshSession()', () async {
      when(mockRepo.refreshSession()).thenAnswer((_) async => validSession());
      final result = await usecases.refreshSession();
      verify(mockRepo.refreshSession()).called(1);
      expect(result.accessToken, 'access_token_123');
    });

    test('logout() delegates to repo.logout()', () async {
      when(mockRepo.logout()).thenAnswer((_) async {});
      await usecases.logout();
      verify(mockRepo.logout()).called(1);
    });

    test('getValidAccessToken() delegates to repo.getValidAccessToken()',
        () async {
      when(mockRepo.getValidAccessToken()).thenAnswer((_) async => 'token_xyz');
      final result = await usecases.getValidAccessToken();
      verify(mockRepo.getValidAccessToken()).called(1);
      expect(result, 'token_xyz');
    });

    test('runKeycloakAction() delegates to repo.runKeycloakAction()', () async {
      when(mockRepo.runKeycloakAction('CONFIGURE_TOTP'))
          .thenAnswer((_) async => validSession());
      await usecases.runKeycloakAction('CONFIGURE_TOTP');
      verify(mockRepo.runKeycloakAction('CONFIGURE_TOTP')).called(1);
    });

    test('updatePassword() delegates to repo.updatePassword()', () async {
      when(mockRepo.updatePassword()).thenAnswer((_) async => validSession());
      await usecases.updatePassword();
      verify(mockRepo.updatePassword()).called(1);
    });
  });

  // =========================================================================
  // AuthProvider
  // =========================================================================
  group('AuthProvider', () {
    late MockAuthUsecases mockUsecases;
    late AuthProvider provider;

    setUpAll(() {
      TestWidgetsFlutterBinding.ensureInitialized();
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      Session.currentUserId = null;
      mockUsecases = MockAuthUsecases();
      provider = AuthProvider(mockUsecases);
    });

    // --- Initial state ---
    test('initial status is unknown', () {
      expect(provider.status, AuthStatus.unknown);
      expect(provider.session, null);
      expect(provider.errorMessage, null);
      expect(provider.isAuthenticated, false);
    });

    // --- init() ---
    group('init()', () {
      test('null restored session → unauthenticated', () async {
        when(mockUsecases.restoreSession()).thenAnswer((_) async => null);

        await provider.init();

        expect(provider.status, AuthStatus.unauthenticated);
        expect(provider.session, null);
      });

      test('valid restored session → authenticated', () async {
        when(mockUsecases.restoreSession())
            .thenAnswer((_) async => validSession());

        await provider.init();

        expect(provider.status, AuthStatus.authenticated);
        expect(provider.session?.subject, 'user-sub-1');
        expect(provider.isAuthenticated, true);
      });

      test('session-revoked error → unauthenticated with error message',
          () async {
        when(mockUsecases.restoreSession())
            .thenThrow(Exception('invalid_grant'));

        await provider.init();

        expect(provider.status, AuthStatus.unauthenticated);
        expect(provider.session, null);
        expect(provider.errorMessage, isNotNull);
      });

      test('non-revoked error → failure with error message', () async {
        when(mockUsecases.restoreSession())
            .thenThrow(Exception('Unexpected crash'));

        await provider.init();

        expect(provider.status, AuthStatus.failure);
        expect(provider.errorMessage, isNotNull);
      });

      test('token_failed error → unauthenticated (treated as revoked)',
          () async {
        when(mockUsecases.restoreSession())
            .thenThrow(Exception('token_failed'));

        await provider.init();

        expect(provider.status, AuthStatus.unauthenticated);
      });
    });

    // --- login() ---
    group('login()', () {
      test('success → authenticated with session', () async {
        when(mockUsecases.login()).thenAnswer((_) async => validSession());

        await provider.login();

        expect(provider.status, AuthStatus.authenticated);
        expect(provider.session?.subject, 'user-sub-1');
        expect(provider.errorMessage, null);
      });

      test('failure → failure status with error message', () async {
        when(mockUsecases.login()).thenThrow(Exception('Login failed'));

        await provider.login();

        expect(provider.status, AuthStatus.failure);
        expect(provider.errorMessage, isNotNull);
        expect(provider.session, null);
      });

      test('is a no-op when already authenticating', () async {
        when(mockUsecases.login()).thenAnswer((_) async {
          await Future.delayed(const Duration(milliseconds: 50));
          return validSession();
        });

        final first = provider.login(); // sets status → authenticating
        await provider.login(); // no-op: status is already authenticating
        await first;

        verify(mockUsecases.login()).called(1);
      });
    });

    // --- logout() ---
    group('logout()', () {
      test('clears session and transitions to unauthenticated', () async {
        when(mockUsecases.logout()).thenAnswer((_) async {});

        await provider.logout();

        expect(provider.status, AuthStatus.unauthenticated);
        expect(provider.session, null);
      });

      test('still clears session even when remote logout throws', () async {
        when(mockUsecases.logout()).thenThrow(Exception('Network error'));

        // logout() rethrows, but the finally block still clears state
        try {
          await provider.logout();
        } catch (_) {}

        expect(provider.session, null);
        expect(provider.status, AuthStatus.unauthenticated);
      });
    });

    // --- clearError() ---
    group('clearError()', () {
      test('in failure state with no session → transitions to unauthenticated',
          () async {
        when(mockUsecases.login()).thenThrow(Exception('Login failed'));
        await provider.login();
        expect(provider.status, AuthStatus.failure);

        provider.clearError();

        expect(provider.errorMessage, null);
        expect(provider.status, AuthStatus.unauthenticated);
      });
    });

    // --- getValidAccessToken() ---
    group('getValidAccessToken()', () {
      test('returns null when session is null and restore returns null',
          () async {
        when(mockUsecases.restoreSession()).thenAnswer((_) async => null);

        final token = await provider.getValidAccessToken();

        expect(token, null);
      });

      test('returns token directly when session is valid (not expired)',
          () async {
        when(mockUsecases.login()).thenAnswer((_) async => validSession());
        await provider.login();

        final token = await provider.getValidAccessToken();

        expect(token, 'access_token_123');
        verifyNever(mockUsecases.refreshSession());
      });

      test('calls refreshSession() when token is expired', () async {
        when(mockUsecases.login())
            .thenAnswer((_) async => expiredSession());
        await provider.login();

        when(mockUsecases.refreshSession())
            .thenAnswer((_) async => validSession());

        final token = await provider.getValidAccessToken();

        verify(mockUsecases.refreshSession()).called(1);
        expect(token, 'access_token_123');
      });
    });

    // --- isAuthenticated ---
    group('isAuthenticated', () {
      test('is false before login', () {
        expect(provider.isAuthenticated, false);
      });

      test('is true after successful login', () async {
        when(mockUsecases.login()).thenAnswer((_) async => validSession());
        await provider.login();
        expect(provider.isAuthenticated, true);
      });

      test('is false after logout', () async {
        when(mockUsecases.login()).thenAnswer((_) async => validSession());
        await provider.login();
        when(mockUsecases.logout()).thenAnswer((_) async {});
        await provider.logout();
        expect(provider.isAuthenticated, false);
      });
    });
  });
}

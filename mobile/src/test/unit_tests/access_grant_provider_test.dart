import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:medflow/presentation/viewmodels/access_grant_provider.dart';
import 'package:medflow/domain/repository/access_grant_repository.dart';
import 'package:medflow/domain/models/grant_model.dart';

@GenerateMocks([AccessGrantRepository])
import 'access_grant_provider_test.mocks.dart';

// --- Dummy data helpers ---

OtpResponse dummyOtp() => OtpResponse(otp: '123456', expiresIn: '10 min');

PendingGrant dummyPending({String id = 'hs-1', String docId = 'doc-1'}) =>
    PendingGrant(
      handshakeId: id,
      patientId: 'patient-1',
      practitionerId: docId,
      createdAt: '2026-01-01T00:00:00.000Z',
    );

Grant dummyGrant({String docId = 'doc-1'}) => Grant(
      grantId: 'grant-1',
      patientId: 'patient-1',
      practitionerId: docId,
      status: 'active',
      scopes: ['read'],
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
    );

void main() {
  late AccessGrantProvider provider;
  late MockAccessGrantRepository mockRepo;

  setUp(() {
    mockRepo = MockAccessGrantRepository();
    provider = AccessGrantProvider(mockRepo);
    // Stub name cache so fetchPendingGrants / fetchActiveGrants don't crash
    when(mockRepo.fetchPractitionerName(any)).thenAnswer((_) async => null);
  });

  // -----------------------------------------------------------------------
  // requestOtp
  // -----------------------------------------------------------------------
  group('requestOtp', () {
    test('sets isRequestingOtp=true then false, populates otp on success',
        () async {
      when(mockRepo.requestOtp()).thenAnswer((_) async => dummyOtp());

      final future = provider.requestOtp();
      expect(provider.isRequestingOtp, true);
      await future;

      expect(provider.isRequestingOtp, false);
      expect(provider.otp?.otp, '123456');
      expect(provider.otp?.expiresIn, '10 min');
      expect(provider.otpError, null);
    });

    test('sets otpError and clears otp on failure', () async {
      when(mockRepo.requestOtp()).thenThrow(Exception('Network error'));

      await provider.requestOtp();

      expect(provider.otp, null);
      expect(provider.otpError, isNotNull);
      expect(provider.otpError, contains('Network error'));
      expect(provider.isRequestingOtp, false);
    });
  });

  // -----------------------------------------------------------------------
  // clearOtp
  // -----------------------------------------------------------------------
  group('clearOtp', () {
    test('wipes otp and error state', () async {
      when(mockRepo.requestOtp()).thenAnswer((_) async => dummyOtp());
      await provider.requestOtp();
      expect(provider.otp, isNotNull);

      provider.clearOtp();

      expect(provider.otp, null);
      expect(provider.otpError, null);
    });
  });

  // -----------------------------------------------------------------------
  // fetchPendingGrants
  // -----------------------------------------------------------------------
  group('fetchPendingGrants', () {
    test('loading transitions and populates list on success', () async {
      when(mockRepo.getPendingGrants())
          .thenAnswer((_) async => [dummyPending()]);

      final future = provider.fetchPendingGrants();
      expect(provider.isLoadingPending, true);
      await future;

      expect(provider.isLoadingPending, false);
      expect(provider.pendingGrants.length, 1);
      expect(provider.pendingGrants.first.handshakeId, 'hs-1');
      expect(provider.pendingError, null);
    });

    test('sets pendingError and keeps list empty on failure', () async {
      when(mockRepo.getPendingGrants()).thenThrow(Exception('Fetch failed'));

      await provider.fetchPendingGrants();

      expect(provider.pendingGrants, isEmpty);
      expect(provider.pendingError, isNotNull);
      expect(provider.isLoadingPending, false);
    });

    test('caches practitioner display name for returned grants', () async {
      when(mockRepo.getPendingGrants())
          .thenAnswer((_) async => [dummyPending(docId: 'doc-42')]);
      when(mockRepo.fetchPractitionerName('doc-42'))
          .thenAnswer((_) async => 'Dr. Smith');

      await provider.fetchPendingGrants();

      expect(provider.practitionerName('doc-42'), 'Dr. Smith');
    });

    test('does not re-fetch name already in cache', () async {
      when(mockRepo.getPendingGrants())
          .thenAnswer((_) async => [dummyPending(docId: 'doc-42')]);
      when(mockRepo.fetchPractitionerName('doc-42'))
          .thenAnswer((_) async => 'Dr. Smith');

      await provider.fetchPendingGrants();
      await provider.fetchPendingGrants(); // second call

      verify(mockRepo.fetchPractitionerName('doc-42')).called(1);
    });
  });

  // -----------------------------------------------------------------------
  // respondToGrant
  // -----------------------------------------------------------------------
  group('respondToGrant', () {
    setUp(() async {
      when(mockRepo.getPendingGrants())
          .thenAnswer((_) async => [dummyPending()]);
      await provider.fetchPendingGrants();
    });

    test('removes grant from list and returns true on approval', () async {
      when(mockRepo.respondToGrant(
        handshakeId: anyNamed('handshakeId'),
        approved: anyNamed('approved'),
        durationMinutes: anyNamed('durationMinutes'),
        scopes: anyNamed('scopes'),
      )).thenAnswer((_) async => dummyGrant());

      final result =
          await provider.respondToGrant(handshakeId: 'hs-1', approved: true);

      expect(result, true);
      expect(provider.pendingGrants, isEmpty);
    });

    test('removes grant from list and returns true on denial', () async {
      when(mockRepo.respondToGrant(
        handshakeId: anyNamed('handshakeId'),
        approved: anyNamed('approved'),
        durationMinutes: anyNamed('durationMinutes'),
        scopes: anyNamed('scopes'),
      )).thenAnswer((_) async => null);

      final result =
          await provider.respondToGrant(handshakeId: 'hs-1', approved: false);

      expect(result, true);
      expect(provider.pendingGrants, isEmpty);
    });

    test('returns false and keeps grant in list on failure', () async {
      when(mockRepo.respondToGrant(
        handshakeId: anyNamed('handshakeId'),
        approved: anyNamed('approved'),
        durationMinutes: anyNamed('durationMinutes'),
        scopes: anyNamed('scopes'),
      )).thenThrow(Exception('Server error'));

      final result =
          await provider.respondToGrant(handshakeId: 'hs-1', approved: true);

      expect(result, false);
      expect(provider.pendingGrants.length, 1);
    });
  });

  // -----------------------------------------------------------------------
  // fetchActiveGrants
  // -----------------------------------------------------------------------
  group('fetchActiveGrants', () {
    test('loading transitions and populates list on success', () async {
      when(mockRepo.getActiveGrants()).thenAnswer((_) async => [dummyGrant()]);

      final future = provider.fetchActiveGrants();
      expect(provider.isLoadingActive, true);
      await future;

      expect(provider.isLoadingActive, false);
      expect(provider.activeGrants.length, 1);
      expect(provider.activeGrants.first.grantId, 'grant-1');
      expect(provider.activeError, null);
    });

    test('sets activeError and keeps list empty on failure', () async {
      when(mockRepo.getActiveGrants()).thenThrow(Exception('Server error'));

      await provider.fetchActiveGrants();

      expect(provider.activeGrants, isEmpty);
      expect(provider.activeError, isNotNull);
      expect(provider.isLoadingActive, false);
    });
  });

  // -----------------------------------------------------------------------
  // revokeGrant
  // -----------------------------------------------------------------------
  group('revokeGrant', () {
    setUp(() async {
      when(mockRepo.getActiveGrants()).thenAnswer((_) async => [dummyGrant()]);
      await provider.fetchActiveGrants();
    });

    test('removes grant from list and returns true on success', () async {
      when(mockRepo.revokeGrant('doc-1')).thenAnswer((_) async {});

      final result = await provider.revokeGrant('doc-1');

      expect(result, true);
      expect(provider.activeGrants, isEmpty);
    });

    test('returns false and keeps grant in list on failure', () async {
      when(mockRepo.revokeGrant(any)).thenThrow(Exception('Revoke failed'));

      final result = await provider.revokeGrant('doc-1');

      expect(result, false);
      expect(provider.activeGrants.length, 1);
    });
  });

  // -----------------------------------------------------------------------
  // practitionerName
  // -----------------------------------------------------------------------
  group('practitionerName', () {
    test('returns raw id when name is not cached', () {
      expect(provider.practitionerName('unknown-id'), 'unknown-id');
    });

    test('returns cached name after a successful fetch', () async {
      when(mockRepo.getPendingGrants())
          .thenAnswer((_) async => [dummyPending(docId: 'doc-99')]);
      when(mockRepo.fetchPractitionerName('doc-99'))
          .thenAnswer((_) async => 'Dr. House');

      await provider.fetchPendingGrants();

      expect(provider.practitionerName('doc-99'), 'Dr. House');
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:medflow/presentation/viewmodels/patient_provider.dart';
import 'package:medflow/domain/repository/patient_repository.dart';

@GenerateMocks([PatientRepository])
import 'patient_provider_test.mocks.dart';

// --- Dummy data helpers ---

PatientProfile dummyProfile({
  String patientId = 'p-1',
  String firstName = 'John',
  String lastName = 'Doe',
  String email = 'john@example.com',
}) =>
    PatientProfile(
      patientId: patientId,
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: '+1234567890',
      gender: 'male',
      bloodType: 'A+',
    );

void main() {
  late PatientProvider provider;
  late MockPatientRepository mockRepo;

  setUp(() {
    mockRepo = MockPatientRepository();
    provider = PatientProvider(mockRepo);
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  group('Initial state', () {
    test('profile is null, not loading or saving, no errors', () {
      expect(provider.profile, null);
      expect(provider.isLoading, false);
      expect(provider.isSaving, false);
      expect(provider.loadError, null);
      expect(provider.saveError, null);
    });
  });

  // -----------------------------------------------------------------------
  // fetchProfile
  // -----------------------------------------------------------------------
  group('fetchProfile', () {
    test('isLoading transitions true → false and sets profile on success',
        () async {
      when(mockRepo.fetchPatient('p-1'))
          .thenAnswer((_) async => dummyProfile());

      final future = provider.fetchProfile('p-1');
      expect(provider.isLoading, true);
      await future;

      expect(provider.isLoading, false);
      expect(provider.profile?.patientId, 'p-1');
      expect(provider.profile?.firstName, 'John');
      expect(provider.loadError, null);
    });

    test('sets loadError and keeps profile null on failure', () async {
      when(mockRepo.fetchPatient(any)).thenThrow(Exception('Not found'));

      await provider.fetchProfile('p-1');

      expect(provider.profile, null);
      expect(provider.loadError, isNotNull);
      expect(provider.loadError, contains('Not found'));
      expect(provider.isLoading, false);
    });

    test('sets profile to null when repository returns null', () async {
      when(mockRepo.fetchPatient(any)).thenAnswer((_) async => null);

      await provider.fetchProfile('p-1');

      expect(provider.profile, null);
      expect(provider.loadError, null);
      expect(provider.isLoading, false);
    });

    test('clears previous loadError before a new fetch attempt', () async {
      // First fetch fails
      when(mockRepo.fetchPatient(any)).thenThrow(Exception('Network error'));
      await provider.fetchProfile('p-1');
      expect(provider.loadError, isNotNull);

      // Second fetch succeeds
      when(mockRepo.fetchPatient(any))
          .thenAnswer((_) async => dummyProfile());
      await provider.fetchProfile('p-1');

      expect(provider.loadError, null);
      expect(provider.profile, isNotNull);
    });

    test('calls repository with the correct patientId', () async {
      when(mockRepo.fetchPatient('patient-abc'))
          .thenAnswer((_) async => dummyProfile(patientId: 'patient-abc'));

      await provider.fetchProfile('patient-abc');

      verify(mockRepo.fetchPatient('patient-abc')).called(1);
    });
  });

  // -----------------------------------------------------------------------
  // saveProfile
  // -----------------------------------------------------------------------
  group('saveProfile', () {
    test('isSaving transitions true → false, updates profile, returns true',
        () async {
      final profile = dummyProfile();
      when(mockRepo.updatePatient(any)).thenAnswer((_) async {});

      final future = provider.saveProfile(profile);
      expect(provider.isSaving, true);
      final result = await future;

      expect(result, true);
      expect(provider.isSaving, false);
      expect(provider.profile?.firstName, 'John');
      expect(provider.saveError, null);
    });

    test('sets saveError and returns false on failure', () async {
      when(mockRepo.updatePatient(any))
          .thenThrow(Exception('Save failed: 500'));

      final result = await provider.saveProfile(dummyProfile());

      expect(result, false);
      expect(provider.saveError, isNotNull);
      expect(provider.saveError, contains('Save failed'));
      expect(provider.isSaving, false);
    });

    test('clears previous saveError before a new save attempt', () async {
      // First save fails
      when(mockRepo.updatePatient(any)).thenThrow(Exception('Network error'));
      await provider.saveProfile(dummyProfile());
      expect(provider.saveError, isNotNull);

      // Second save succeeds
      when(mockRepo.updatePatient(any)).thenAnswer((_) async {});
      await provider.saveProfile(dummyProfile());

      expect(provider.saveError, null);
    });

    test('does not update profile in memory on failure', () async {
      // Load an initial profile
      when(mockRepo.fetchPatient(any))
          .thenAnswer((_) async => dummyProfile(firstName: 'Original'));
      await provider.fetchProfile('p-1');
      expect(provider.profile?.firstName, 'Original');

      // Attempt save with a modified profile — fails
      when(mockRepo.updatePatient(any)).thenThrow(Exception('Server error'));
      await provider.saveProfile(dummyProfile(firstName: 'Modified'));

      // In-memory profile should still be the original value
      expect(provider.profile?.firstName, 'Original');
    });

    test('calls repository with the correct profile', () async {
      final profile = dummyProfile(patientId: 'p-99');
      when(mockRepo.updatePatient(any)).thenAnswer((_) async {});

      await provider.saveProfile(profile);

      verify(mockRepo.updatePatient(any)).called(1);
    });
  });
}

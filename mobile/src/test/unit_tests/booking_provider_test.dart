import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:medflow/presentation/viewmodels/booking_provider.dart';
import 'package:medflow/data/repositories/booking_repo_impl.dart';
import 'package:medflow/domain/models/doctors.dart';
import 'package:medflow/domain/models/appointment_history.dart';
import 'package:medflow/utils/enums/speciality_event.dart';
import 'package:medflow/database/db_helper.dart';

class MockBookingRepository extends Mock implements BookingRepositoryImpl {
  @override
  Future<Map<String, dynamic>> bookAppointmentWithSlot({
    required String? patientId,
    required String? practitionerId,
    required String? slotId,
    required String? start,
    required String? end,
    required String? appointmentType,
    String? comment,
    String? symptomsText,
    List<String>? documentReferenceIds,
  }) =>
      super.noSuchMethod(
        Invocation.method(#bookAppointmentWithSlot, [], {
          #patientId: patientId,
          #practitionerId: practitionerId,
          #slotId: slotId,
          #start: start,
          #end: end,
          #appointmentType: appointmentType,
          #comment: comment,
          #symptomsText: symptomsText,
          #documentReferenceIds: documentReferenceIds,
        }),
        returnValue: Future.value(<String, dynamic>{'id': 'appt-123'}),
      ) as Future<Map<String, dynamic>>;

  @override
  Future<List<Doctor>> getDoctors({String? specialty}) => super.noSuchMethod(
        Invocation.method(#getDoctors, [], {#specialty: specialty}),
        returnValue: Future.value(<Doctor>[]),
      ) as Future<List<Doctor>>;

  @override
  Future<List<AppointmentHistory>> getAppointmentsByPatient(
          String? patientId) =>
      super.noSuchMethod(
        Invocation.method(#getAppointmentsByPatient, [patientId]),
        returnValue: Future.value(<AppointmentHistory>[]),
      ) as Future<List<AppointmentHistory>>;

  @override
  Future<List<DoctorSlot>> getDoctorSlots(String? doctorId) =>
      super.noSuchMethod(
        Invocation.method(#getDoctorSlots, [doctorId]),
        returnValue: Future.value(<DoctorSlot>[]),
      ) as Future<List<DoctorSlot>>;

  @override
  Future<Map<String, dynamic>> cancelAppointment(String? appointmentId) =>
      super.noSuchMethod(
        Invocation.method(#cancelAppointment, [appointmentId]),
        returnValue:
            Future.value(<String, dynamic>{'status': 'cancelled'}),
      ) as Future<Map<String, dynamic>>;
}

Doctor createDummyDoctor() => Doctor(
      id: 'doc_1',
      name: 'Strange',
      title: 'Sorcerer Supreme',
      imageUrl: 'http://img.com',
      rating: 5.0,
      visitorCount: 100,
      specialtyDetail: 'Magic',
      address: 'Sanctum',
      fees: 100,
      waitingTime: 0,
      nextAvailable: 'Now',
      schedule: [],
      reviews: [],
    );

DoctorSlot createDummySlot() => DoctorSlot(
      id: 'slot-1',
      startTime: '10:00 AM',
      endTime: '10:30 AM',
      date: 'Jan 19, 2025',
      rawDate: '2025-01-19',
      rawStart: '2025-01-19T10:00:00Z',
      rawEnd: '2025-01-19T10:30:00Z',
      status: 'free',
      scheduleReference: 'Schedule/1',
    );

void _stubPostBookingRefresh(MockBookingRepository repo) {
  when(repo.getDoctors()).thenAnswer((_) async => []);
  when(repo.getAppointmentsByPatient(any)).thenAnswer((_) async => []);
  when(repo.getDoctorSlots(any)).thenAnswer((_) async => []);
}

void main() {
  late BookingProvider provider;
  late MockBookingRepository mockRepo;

  setUp(() {
    mockRepo = MockBookingRepository();
    provider = BookingProvider(mockRepo);
    Session.currentUserId = 'patient-1';
  });

  tearDown(() {
    Session.currentUserId = null;
  });

  group('BookingProvider Logic Tests', () {
    test('Initial state should be empty', () {
      expect(provider.selectedDoctor, null);
      expect(provider.selectedDate, null);
      expect(provider.appointments.isEmpty, true);
    });

    test('Selecting a doctor resets Date and Time', () {
      provider.setTimeSlot(DateTime(2026, 1, 1), '10:00 AM');
      provider.selectDoctor(createDummyDoctor());

      expect(provider.selectedDoctor, isNotNull);
      expect(provider.selectedDate, null);
      expect(provider.selectedTime, null);
    });

    test('isBookingComplete returns true only when all fields are set', () {
      provider.setSpecialty(SpecialityEventEnum.cardiology);
      expect(provider.isBookingComplete, false);

      provider.selectDoctor(createDummyDoctor());
      expect(provider.isBookingComplete, false);

      provider.setTimeSlot(DateTime.now(), '10:00 AM');
      expect(provider.isBookingComplete, true);
    });

    test('confirmBooking books slot via FHIR and adds appointment', () async {
      provider.selectDoctor(createDummyDoctor());
      provider.selectSlot(createDummySlot());

      when(mockRepo.bookAppointmentWithSlot(
        patientId: anyNamed('patientId'),
        practitionerId: anyNamed('practitionerId'),
        slotId: anyNamed('slotId'),
        start: anyNamed('start'),
        end: anyNamed('end'),
        appointmentType: anyNamed('appointmentType'),
      )).thenAnswer((_) async => {'id': 'appt-123'});
      _stubPostBookingRefresh(mockRepo);

      final result = await provider.confirmBooking();

      expect(result, true);
      expect(provider.appointments.length, 1);
      expect(provider.appointments.first.doctor.name, 'Strange');
      expect(provider.appointments.first.status, AppointmentStatus.upcoming);
      verify(mockRepo.bookAppointmentWithSlot(
        patientId: anyNamed('patientId'),
        practitionerId: anyNamed('practitionerId'),
        slotId: anyNamed('slotId'),
        start: anyNamed('start'),
        end: anyNamed('end'),
        appointmentType: anyNamed('appointmentType'),
      )).called(1);
    });

    test('confirmBooking returns false when no slot is selected', () async {
      provider.selectDoctor(createDummyDoctor());
      // No selectSlot() — confirmBooking guards on _selectedSlot != null

      final result = await provider.confirmBooking();

      expect(result, false);
      expect(provider.appointments.isEmpty, true);
      verifyNever(mockRepo.bookAppointmentWithSlot(
        patientId: anyNamed('patientId'),
        practitionerId: anyNamed('practitionerId'),
        slotId: anyNamed('slotId'),
        start: anyNamed('start'),
        end: anyNamed('end'),
        appointmentType: anyNamed('appointmentType'),
      ));
    });

    test('confirmBooking returns false when no patient session', () async {
      Session.currentUserId = null;
      provider.selectDoctor(createDummyDoctor());
      provider.selectSlot(createDummySlot());

      final result = await provider.confirmBooking();

      expect(result, false);
    });

    test('cancelAppointment removes appointment from list', () async {
      provider.selectDoctor(createDummyDoctor());
      provider.selectSlot(createDummySlot());

      when(mockRepo.bookAppointmentWithSlot(
        patientId: anyNamed('patientId'),
        practitionerId: anyNamed('practitionerId'),
        slotId: anyNamed('slotId'),
        start: anyNamed('start'),
        end: anyNamed('end'),
        appointmentType: anyNamed('appointmentType'),
      )).thenAnswer((_) async => {'id': 'appt-123'});
      _stubPostBookingRefresh(mockRepo);

      await provider.confirmBooking();
      expect(provider.appointments.length, 1);

      when(mockRepo.cancelAppointment(any))
          .thenAnswer((_) async => {'status': 'cancelled'});

      await provider.cancelAppointment('appt-123');

      expect(provider.appointments.isEmpty, true);
      verify(mockRepo.cancelAppointment(any)).called(1);
    });

    test('clearBookingData resets all selection fields', () {
      provider.selectDoctor(createDummyDoctor());
      provider.setTimeSlot(DateTime.now(), '10:00 AM');

      provider.clearBookingData();

      expect(provider.selectedDoctor, null);
      expect(provider.selectedTime, null);
      expect(provider.selectedDate, null);
    });
  });
}

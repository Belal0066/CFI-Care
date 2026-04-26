import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:medflow/presentation/viewmodels/booking_provider.dart';
import 'package:medflow/data/repositories/booking_repo_impl.dart';
import 'package:medflow/domain/models/doctors.dart';
import 'package:medflow/domain/models/appointment_history.dart';
import 'package:medflow/utils/enums/speciality_event.dart';

// 1. Mock the Repository
// We need to mock the implementation since your Provider depends on the Impl class directly
class MockBookingRepository extends Mock implements BookingRepositoryImpl {
  @override
  Future<bool> createBooking(AppointmentHistory? appointment) {
    return super.noSuchMethod(
      Invocation.method(#createBooking, [appointment]),
      returnValue: Future.value(true),
    );
  }
}

void main() {
  late BookingProvider provider;
  late MockBookingRepository mockRepo;

  // Helper to create a dummy Doctor (since the object is large)
  Doctor createDummyDoctor() {
    return Doctor(
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
  }

  setUp(() {
    mockRepo = MockBookingRepository();
    provider = BookingProvider(mockRepo);
  });

  group('BookingProvider Logic Tests', () {
    
    test('Initial state should be empty', () {
      expect(provider.selectedDoctor, null);
      expect(provider.selectedDate, null);
      expect(provider.appointments.isEmpty, true);
    });

    test('Selecting a doctor should reset Date and Time', () {
      // Arrange: Set a date first
      provider.setTimeSlot(DateTime(2026, 1, 1), '10:00 AM');
      
      // Act: Select a doctor
      provider.selectDoctor(createDummyDoctor());

      // Assert: Doctor is set, but time/date are wiped (as per your logic)
      expect(provider.selectedDoctor, isNotNull);
      expect(provider.selectedDate, null);
      expect(provider.selectedTime, null);
    });

    test('isBookingComplete returns true only when all fields are set', () {
      // 1. Only Specialty
      provider.setSpecialty(SpecialityEventEnum.cardiology); // Assuming enum exists
      expect(provider.isBookingComplete, false);

      // 2. Add Doctor
      provider.selectDoctor(createDummyDoctor());
      expect(provider.isBookingComplete, false);

      // 3. Add Time
      provider.setTimeSlot(DateTime.now(), '10:00 AM');
      expect(provider.isBookingComplete, true);
    });

    test('confirmBooking adds appointment via Optimistic Update', () async {
      // Arrange
      provider.setSpecialty(SpecialityEventEnum.cardiology);
      provider.selectDoctor(createDummyDoctor());
      provider.setTimeSlot(DateTime(2025, 1, 19), '10:00 AM');

      // Stub the repo to return success
      when(mockRepo.createBooking(any)).thenAnswer((_) async => true);

      // Act
      await provider.confirmBooking();

      // Assert
      expect(provider.appointments.length, 1);
      expect(provider.appointments.first.doctor.name, 'Strange');
      expect(provider.appointments.first.status, AppointmentStatus.upcoming);
      
      // Verify repo was called
      verify(mockRepo.createBooking(any)).called(1);
    });

    test('cancelAppointment updates status locally', () async {
      when(mockRepo.createBooking(any)).thenAnswer((_) async => true);
      provider.setSpecialty(SpecialityEventEnum.cardiology);
      provider.selectDoctor(createDummyDoctor());
      provider.setTimeSlot(DateTime(2025, 1, 19), '10:00 AM');
      await provider.confirmBooking();

      final appointmentId = provider.appointments.first.id;

      // Act
      provider.cancelAppointment(appointmentId);

      // Assert
      expect(provider.appointments.first.status, AppointmentStatus.canceled);
    });

    test('clearBookingData resets all selection fields', () {
      // Arrange
      provider.selectDoctor(createDummyDoctor());
      provider.setTimeSlot(DateTime.now(), '10:00 AM');

      // Act
      provider.clearBookingData();

      // Assert
      expect(provider.selectedDoctor, null);
      expect(provider.selectedTime, null);
      expect(provider.selectedDate, null);
    });
  });
}
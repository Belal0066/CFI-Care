import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:network_image_mock/network_image_mock.dart'; // Wraps tests to allow NetworkImage

// Import your actual app files here
import 'package:medflow/presentation/widgets/appointment_card.dart';
import "package:medflow/presentation/viewmodels/booking_provider.dart";
import 'package:medflow/domain/models/appointment_history.dart';
import 'package:medflow/domain/models/doctors.dart';

// 1. Create a Mock for your Provider
class MockBookingProvider extends Mock implements BookingProvider {
  @override
  Future<void> cancelAppointment(String id) =>
      (super.noSuchMethod(
            Invocation.method(#cancelAppointment, [id]),
            returnValue: Future<void>.value(),
            returnValueForMissingStub: Future<void>.value(),
          )
          as Future<void>);
}

void main() {
  late MockBookingProvider mockProvider;

  setUp(() {
    mockProvider = MockBookingProvider();
  });

  // Helper to create the specific data state we need
  AppointmentHistory createAppointment({required String status}) {
    return AppointmentHistory(
      id: '123',
      status: status == 'canceled'
          ? AppointmentStatus.canceled
          : AppointmentStatus.upcoming,
      date: '2026-05-20',
      time: '10:00 AM',
      doctor: Doctor(
        id: 'doc_1',
        name: 'Strange',
        title: 'Neurosurgeon',
        imageUrl:
            'https://example.com/doctor.jpg', // Mocked by network_image_mock
        address: '177A Bleecker St',

        // Dummy data to satisfy the required constructor fields
        rating: 4.8,
        visitorCount: 1200,
        specialtyDetail: 'Brain Surgery',
        fees: 500,
        waitingTime: 15,
        nextAvailable: 'Tomorrow',
        schedule:
            [], // Pass empty list if you don't need to test schedule logic specifically
        reviews: [], // Pass empty list
        about: 'Expert in the mystic arts of medicine.',
      ),
    );
  }

  // Helper to pump the widget with the Provider
  Future<void> pumpAppointmentCard(
    WidgetTester tester,
    AppointmentHistory appointment,
  ) async {
    await mockNetworkImagesFor(
      () => tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ChangeNotifierProvider<BookingProvider>.value(
              value: mockProvider,
              child: AppointmentCard(appointment: appointment),
            ),
          ),
        ),
      ),
    );
  }

  group('AppointmentCard UI Tests', () {
    testWidgets(
      'Active Appointment renders correctly (Blue theme, Cancel button visible)',
      (WidgetTester tester) async {
        // Arrange
        final appointment = createAppointment(status: 'confirmed');

        // Act
        await pumpAppointmentCard(tester, appointment);

        // Assert
        expect(find.text('Dr. Strange'), findsOneWidget);
        expect(find.text('Booking Confirmed'), findsOneWidget);
        expect(
          find.text('Cancel'),
          findsOneWidget,
        ); // Cancel button should be there

        // Verify visual style (Active checkmark icon)
        expect(find.byIcon(Icons.check_circle), findsOneWidget);
      },
    );

    testWidgets(
      'Canceled Appointment renders correctly (Grey/Red theme, No Cancel button)',
      (WidgetTester tester) async {
        // Arrange
        final appointment = createAppointment(status: 'canceled');

        // Act
        await pumpAppointmentCard(tester, appointment);

        // Assert
        expect(find.text('Appointment Canceled'), findsOneWidget);
        expect(
          find.text('Cancel'),
          findsNothing,
        ); // Cancel button should be GONE

        // Verify strikethrough style on Doctor Name
        final textWidget = tester.widget<Text>(find.text('Dr. Strange'));
        expect(textWidget.style?.decoration, TextDecoration.lineThrough);
      },
    );

    testWidgets('Tapping "Cancel" triggers the Provider method', (
      WidgetTester tester,
    ) async {
      // Arrange
      final appointment = createAppointment(status: 'confirmed');
      await pumpAppointmentCard(tester, appointment);

      // Act
      await tester.tap(find.text('Cancel'));
      await tester.pump(); // Rebuild UI

      // Assert
      // Verify that the function cancelAppointment('123') was called exactly once
      verify(mockProvider.cancelAppointment('123')).called(1);
    });
  });
}

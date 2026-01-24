import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:medflow/presentation/widgets/doctor_card.dart'; 
import 'package:medflow/domain/models/doctors.dart';
import 'package:medflow/presentation/viewmodels/booking_provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:medflow/presentation/screens/doctor_profile_screen.dart';
import 'doctor_card_test.mocks.dart';
import 'dart:io';
import 'dart:async';



@GenerateNiceMocks([
  MockSpec<BookingProvider>(),
  MockSpec<NavigatorObserver>(),
])
void main() {
  late MockBookingProvider mockProvider;

  // Helper to create the Doctor object
  Doctor createDummyDoctor() {
    return Doctor(
      id: 'doc_1',
      name: 'Strange',
      title: 'Sorcerer Supreme',
      imageUrl: 'https://example.com/doctor.png', // Local asset path
      rating: 4.9,
      visitorCount: 1000,
      specialtyDetail: 'Neurosurgery',
      address: '177A Bleecker St',
      fees: 500,
      waitingTime: 30,
      nextAvailable: 'Available Today',
      schedule: [],
      reviews: [],
    );
  }

  setUp(() {
    HttpOverrides.global = _MockHttpOverrides();
    mockProvider = MockBookingProvider();
  });

  // Helper to pump the widget with Provider
  Widget createWidgetUnderTest(Doctor doctor, NavigatorObserver? observer) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<BookingProvider>.value(value: mockProvider),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: DoctorCard(doctor: doctor),
        ),
        // We inject the observer to test navigation push
        navigatorObservers: observer != null ? [observer] : [],
      ),
    );
  }

  group('DoctorCard UI Tests', () {
    testWidgets('Renders all doctor details correctly', (WidgetTester tester) async {
      // Arrange
      final doctor = createDummyDoctor();

      // Act
      await tester.pumpWidget(createWidgetUnderTest(doctor, null));

      // Assert - Check Texts
      expect(find.text('Dr. Strange'), findsOneWidget);
      expect(find.text('Sorcerer Supreme'), findsOneWidget); // Title
      expect(find.text('4.9'), findsOneWidget); // Rating
      expect(find.text('177A Bleecker St'), findsOneWidget); // Address
      expect(find.text('Neurosurgery'), findsOneWidget); // Specialty
      expect(find.text('500 EGP'), findsOneWidget); // Fees
      expect(find.text('30 Mins'), findsOneWidget); // Time
      expect(find.text('Available Today'), findsOneWidget); // Availability
      
      // Assert - Check Icons
      expect(find.byIcon(Icons.location_on_outlined), findsOneWidget);
      expect(find.byIcon(Icons.verified), findsOneWidget);
    });

    testWidgets('Tapping "Book Now" calls Provider and Navigates', (WidgetTester tester) async {
      // Arrange
      final doctor = createDummyDoctor();
      final mockObserver = MockNavigatorObserver(); 

      when(mockObserver.navigator).thenReturn(null);
      
      await tester.pumpWidget(createWidgetUnderTest(doctor, mockObserver));

      // Act
      await tester.tap(find.text('Book Now'));
      await tester.pumpAndSettle(); // Wait for navigation animation

      // Assert 1: Verify Provider was called
      verify(mockProvider.selectDoctor(doctor)).called(1);

      // Assert 2: Verify Navigation happened
      verify(mockObserver.didPush(any, any));
      
      // Assert 3: Verify we are on the new screen
      expect(find.byType(DoctorProfileScreen), findsOneWidget);
    });
  });
  
}
// --- MOCK CLASSES ---

class _MockHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return _MockHttpClient();
  }
}

class _MockHttpClient extends Mock implements HttpClient {
  @override
  Future<HttpClientRequest> getUrl(Uri url) async {
    return _MockHttpClientRequest();
  }
}

class _MockHttpClientRequest extends Mock implements HttpClientRequest {
  @override
  Future<HttpClientResponse> close() async {
    return _MockHttpClientResponse();
  }
}

class _MockHttpClientResponse extends Mock implements HttpClientResponse {
  @override
  int get statusCode => 200;

  @override
  int get contentLength => 0; // Optional but good to have

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    // 1. Define the dummy pixel data
    final pixel = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49,
      0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
      0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44,
      0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D,
      0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
      0x60, 0x82,
    ];

    // 2. Create a REAL stream from that data
    final stream = Stream<List<int>>.value(pixel);

    // 3. Delegate the subscription to the real stream
    return stream.listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }
}
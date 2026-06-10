import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medflow/presentation/widgets/vitals_card.dart'; 
import 'package:medflow/domain/models/vitals.dart'; 

void main() {
  // Helper to create the widget wrapped in MaterialApp
  Widget createWidgetUnderTest(VitalSign vital) {
    return MaterialApp(
      home: Scaffold(
        body: VitalCard(vital: vital),
      ),
    );
  }

  group('VitalCard UI Tests', () {
    testWidgets('renders value, unit, and icon correctly', (WidgetTester tester) async {
      // Arrange
      final vital = VitalSign(
        id: '1',
        type: VitalType.heartRate, 
        value: '120',
        unit: 'BPM',
        icon: Icons.favorite,
        color: Colors.red,
        lastUpdated: DateTime.now(),
      );

      // Act
      await tester.pumpWidget(createWidgetUnderTest(vital));

      // Assert
      // expect(find.text('120', findRichText: true), findsOneWidget); // Value
      expect(find.byWidgetPredicate((widget) {
        if (widget is RichText) {
          final span = widget.text as TextSpan;
          return span.toPlainText().contains('120');
        }
        return false;
      }), findsOneWidget);
      expect(find.textContaining('BPM', findRichText: true), findsOneWidget); // Unit 
      expect(find.byIcon(Icons.favorite), findsOneWidget); // Icon
      expect(find.byIcon(Icons.watch), findsOneWidget); // The static watch icon
    });

    testWidgets('Time logic: displays "Just now" for recent times', (WidgetTester tester) async {
      // Arrange: Time is now
      final vital = VitalSign(
        id: '2',
        type: VitalType.bloodPressure,
        value: '120/80',
        unit: 'mmHg',
        icon: Icons.water_drop,
        color: Colors.blue,
        lastUpdated: DateTime.now(), // < 1 min ago
      );

      // Act
      await tester.pumpWidget(createWidgetUnderTest(vital));

      // Assert
      expect(find.text('Just now'), findsOneWidget);
    });

    testWidgets('Time logic: displays "X min ago" correctly', (WidgetTester tester) async {
      // Arrange: Time is 15 minutes ago
      final pastTime = DateTime.now().subtract(const Duration(minutes: 15));
      
      final vital = VitalSign(
        id: '3',
        type: VitalType.oxygen,
        value: '98',
        unit: '%',
        icon: Icons.air,
        color: Colors.blue,
        lastUpdated: pastTime,
      );

      // Act
      await tester.pumpWidget(createWidgetUnderTest(vital));

      // Assert
      expect(find.text('15 min ago'), findsOneWidget);
    });

    testWidgets('Time logic: displays "X hr ago" correctly', (WidgetTester tester) async {
      // Arrange: Time is 3 hours ago
      final pastTime = DateTime.now().subtract(const Duration(hours: 3));

      final vital = VitalSign(
        id: '4',
        type: VitalType.temperature,
        value: '36.5',
        unit: 'C',
        icon: Icons.thermostat,
        color: Colors.orange,
        lastUpdated: pastTime,
      );

      // Act
      await tester.pumpWidget(createWidgetUnderTest(vital));

      // Assert
      expect(find.text('3 hr ago'), findsOneWidget);
    });
  });
}
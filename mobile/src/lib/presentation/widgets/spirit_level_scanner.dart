import 'dart:async';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

class SpiritLevelScanner extends StatefulWidget {
  final VoidCallback onReadyToScan;

  const SpiritLevelScanner({super.key, required this.onReadyToScan});

  @override
  State<SpiritLevelScanner> createState() => _SpiritLevelScannerState();
}

class _SpiritLevelScannerState extends State<SpiritLevelScanner> {
  double x = 0, y = 0;
  bool isLevel = false;
  StreamSubscription? _subscription;

  @override
  void initState() {
    super.initState();
    // Listen to accelerometer events
    _subscription = accelerometerEventStream().listen((AccelerometerEvent event) {
      setState(() {
        x = event.x;
        y = event.y;
        // Check if phone is within a 0.5 range of being perfectly flat
        isLevel = (x.abs() < 0.5 && y.abs() < 0.5);
      });
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // The Spirit Level UI
        Container(
          width: 150,
          height: 150,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: isLevel ? Colors.green : Colors.red, width: 4),
          ),
          child: Center(
            child: Transform.translate(
              // Scale the sensor data to move the "bubble"
              offset: Offset(x * 10, y * 10), 
              child: Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: isLevel ? Colors.green : Colors.red,
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          isLevel ? "Device Level - Ready to Scan" : "Tilt device until level",
          style: TextStyle(color: isLevel ? Colors.green : Colors.red, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 10),
        ElevatedButton(
          onPressed: isLevel ? widget.onReadyToScan : null, 
          child: const Text("Scan Document"),
        ),
      ],
    );
  }
}
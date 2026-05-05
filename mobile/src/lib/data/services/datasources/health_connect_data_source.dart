import 'dart:io' show Platform;

import 'package:health/health.dart';
import 'package:permission_handler/permission_handler.dart';

class HealthConnectDataSource {
  final Health _health = Health();

  // Define the types of data you want to read
  final types = [
    HealthDataType.HEART_RATE,
    HealthDataType.STEPS,
    // Add blood pressure, temperature, etc. here
  ];

  /// Initialize the health plugin.
  /// (Best practice: Call this once when your app starts, or right before requesting permissions)
  void configureHealth() {
    _health.configure();
  }

  /// Request permissions from the user
  Future<bool> requestPermissions() async {
    configureHealth();

    // Steps data also requires the Android activity-recognition runtime permission.
    if (Platform.isAndroid && types.contains(HealthDataType.STEPS)) {
      final activityRecognitionStatus = await Permission.activityRecognition
          .request();
      if (!activityRecognitionStatus.isGranted) {
        return false;
      }
    }

    // We only need READ access for these data types.
    final permissions = types.map((e) => HealthDataAccess.READ).toList();

    final alreadyAuthorized = await _health.hasPermissions(
      types,
      permissions: permissions,
    );

    if (alreadyAuthorized == true) {
      return true;
    }

    final granted = await _health.requestAuthorization(
      types,
      permissions: permissions,
    );

    if (granted && Platform.isAndroid) {
      await _health.requestHealthDataHistoryAuthorization();
    }

    return granted;
  }

  /// Fetch the raw data points
  Future<List<HealthDataPoint>> getRawHealthData() async {
    final isAuthorized = await requestPermissions();
    if (!isAuthorized) {
      return [];
    }

    final now = DateTime.now();
    final earliest = DateTime.fromMillisecondsSinceEpoch(0);

    // 1. Fetch data from Health Connect using the new named parameters
    List<HealthDataPoint> healthData = await _health.getHealthDataFromTypes(
      types: types,
      startTime: earliest,
      endTime: now,
    );

    // 2. Filter out duplicates using the singleton
    return _health.removeDuplicates(healthData);
  }
}

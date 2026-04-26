import 'package:health/health.dart';

class HealthConnectDataSource {
  // Define the types of data you want to read
  final types = [
    HealthDataType.HEART_RATE,
    HealthDataType.STEPS,
    // Add blood pressure, temperature, etc. here
  ];

  /// Initialize the health plugin. 
  /// (Best practice: Call this once when your app starts, or right before requesting permissions)
  void configureHealth() {
    Health().configure();
  }

  /// Request permissions from the user
  Future<bool> requestPermissions() async {
    // We only need READ access for this platform
    final permissions = types.map((e) => HealthDataAccess.READ).toList();
    
    // Use the new Health() singleton
    return await Health().requestAuthorization(types, permissions: permissions);
  }

  /// Fetch the raw data points
  Future<List<HealthDataPoint>> getRawHealthData() async {
    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));

    // 1. Fetch data from Health Connect using the new named parameters
    List<HealthDataPoint> healthData = await Health().getHealthDataFromTypes(
      types: types,
      startTime: yesterday,
      endTime: now,
    );

    // 2. Filter out duplicates using the singleton
    return Health().removeDuplicates(healthData);
  }
}
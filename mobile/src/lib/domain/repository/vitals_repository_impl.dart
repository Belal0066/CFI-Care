import 'package:flutter/material.dart';
import 'package:health/health.dart';
import '../../domain/models/vitals.dart';
import '../../data/repositories/vitals_repo.dart';
import '../../data/services/datasources/health_connect_data_source.dart';


class VitalsRepositoryImpl implements VitalsRepository {
  final HealthConnectDataSource dataSource;

  VitalsRepositoryImpl(this.dataSource);

  @override
  Future<List<VitalSign>> fetchVitalSigns() async {
    List<VitalSign> myVitals = [];

    try {
      // Get the raw data from your data source
      List<HealthDataPoint> healthData = await dataSource.getRawHealthData();
      final now = DateTime.now();

      // Map Heart Rate 
      var heartRatePoints = healthData.where((d) => d.type == HealthDataType.HEART_RATE).toList();
      if (heartRatePoints.isNotEmpty) {
        heartRatePoints.sort((a, b) => b.dateTo.compareTo(a.dateTo));
        var latestHR = heartRatePoints.first;
        var hrValue = (latestHR.value as NumericHealthValue).numericValue.round().toString();
        myVitals.add(
          VitalSign(
            id: 'hr_1',
            type: VitalType.heartRate,
            value: hrValue,
            unit: 'BPM',
            icon: Icons.favorite,
            color: Colors.red,
            lastUpdated: latestHR.dateTo,
          ),
        );
      }

      // Map Steps 
      var stepPoints = healthData.where((d) => d.type == HealthDataType.STEPS).toList();
      if (stepPoints.isNotEmpty) {
        
        int totalSteps = 0;
        for (var point in stepPoints) {
          int stepValue = 0;
          if (point.value is NumericHealthValue) {
            stepValue = (point.value as NumericHealthValue).numericValue.toInt();
          }
          totalSteps += stepValue;
        }
        
        myVitals.add(
          VitalSign(
            id: 'steps_1',
            type: VitalType.steps,
            value: totalSteps.toString(),
            unit: 'Steps',
            icon: Icons.directions_walk,
            color: Colors.green,
            lastUpdated: now, 
          ),
        );
      }

    } catch (e) {
      debugPrint("Caught exception in fetchVitalSigns: $e");
    }

    // Return the clean domain models to the ViewModel
    return myVitals;
  }
}
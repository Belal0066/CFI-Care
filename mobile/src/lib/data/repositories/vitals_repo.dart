import 'package:flutter/material.dart';
import '../../domain/models/vitals.dart';

class VitalsRepository {
  Future<List<VitalSign>> getSmartWatchData() async {
    // Simulate network/bluetooth delay
    await Future.delayed(const Duration(milliseconds: 800));

    return [
      VitalSign(
        id: '1',
        type: VitalType.heartRate,
        value: '72',
        unit: 'BPM',
        icon: Icons.favorite,
        color: Colors.redAccent,
        lastUpdated: DateTime.now().subtract(const Duration(minutes: 5)),
      ),
      VitalSign(
        id: '2',
        type: VitalType.bloodPressure,
        value: '118/76',
        unit: 'mmHg',
        icon: Icons.water_drop,
        color: Colors.blueAccent,
        lastUpdated: DateTime.now().subtract(const Duration(minutes: 30)),
      ),
      VitalSign(
        id: '3',
        type: VitalType.oxygen,
        value: '98',
        unit: '%',
        icon: Icons.air,
        color: Colors.cyan,
        lastUpdated: DateTime.now().subtract(const Duration(minutes: 2)),
      ),
      VitalSign(
        id: '4',
        type: VitalType.steps,
        value: '4,250',
        unit: 'Steps',
        icon: Icons.directions_walk,
        color: Colors.orange,
        lastUpdated: DateTime.now(),
      ),
    ];
  }
}
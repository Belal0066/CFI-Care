import 'package:flutter/material.dart';

enum VitalType { heartRate, bloodPressure, oxygen, steps, temperature }

class VitalSign {
  final String id;
  final VitalType type;
  final String value;     // String to handle "120/80" or "98"
  final String unit;      // "BPM", "%", "Steps"
  final IconData icon;
  final Color color;
  final DateTime lastUpdated;

  VitalSign({
    required this.id,
    required this.type,
    required this.value,
    required this.unit,
    required this.icon,
    required this.color,
    required this.lastUpdated,
  });
}
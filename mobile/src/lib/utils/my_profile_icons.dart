import 'package:flutter/material.dart';
//Icons for personal info
  final Map<String, IconData> personalIcons = {
    'Phone': Icons.phone,
    'Address': Icons.location_on,
    'Date of Birth': Icons.cake,
    'Gender': Icons.person_outline,
  };

  //Icons for medical info
  final Map<String, IconData> medicalIcons = {
    'Blood Type': Icons.bloodtype,
    'Height': Icons.height,
    'Weight': Icons.monitor_weight,
    'Allergies': Icons.warning_amber,
    'Medical Conditions': Icons.medical_services,
    'Medications': Icons.medication,
    'Genetic Conditions': Icons.biotech,
    'Chronic Diseases': Icons.sick,
  };

  //Icons for emergency info
  final Map<String, IconData> emergencyIcons = {
    'Emergency Contact': Icons.contact_emergency,
    'Insurance Provider': Icons.shield,
    'Policy Number': Icons.policy,
  };
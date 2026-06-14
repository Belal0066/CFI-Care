import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

final uuid = Uuid();

// final dateFormatter = DateFormat.yMd();
final typeOfEventIcons = {
  // Microscope for Lab
  TypeOfEventEnum.lab: Icons.biotech,

  // Scanner or Skeleton for Scans (X-Ray/MRI)
  // Icons.document_scanner is good, or Icons.personal_injury for X-ray style
  TypeOfEventEnum.scan: Icons.document_scanner,

  // Calendar/Clock for Appointments
  TypeOfEventEnum.appointment: Icons.calendar_month,

  // Surgery / procedure note
  TypeOfEventEnum.surgery: Icons.medical_information,

  // Generic category icon
  TypeOfEventEnum.other: Icons.category,
};

final specialityEventIcons = {
  // Heart with ECG line
  SpecialityEventEnum.cardiology: Icons.monitor_heart,

  // Head with Brain symbol
  SpecialityEventEnum.neurology: Icons.psychology,

  // Blood drop symbol
  SpecialityEventEnum.hematology: Icons.bloodtype,

  // Doctor/Medical Kit generic
  SpecialityEventEnum.other: Icons.medical_services,
};

// --- Event Class ---
class Event {
  final String? id;
  final String title;
  final String summary;
  final String details;
  final String? attachmentPath; // Added Attachment Path
  final TypeOfEventEnum selectedTypeOfEventEnum;
  final SpecialityEventEnum selectedSpecialityEnum;
  final TimeOfDay time;

  Event({
    this.id,
    required this.title,
    this.summary = '', 
    required this.details,
    this.attachmentPath, // Optional
    required this.selectedTypeOfEventEnum,
    required this.selectedSpecialityEnum,
    required this.time,
  });
}

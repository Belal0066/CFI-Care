import 'package:flutter/material.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

class DocumentModel {
  final String? id;       // Local DB ID
  final String? serverId; // Remote Backend ID
  final String title;
  final String filePath;
  final bool isPDF;
  final String url;
  final String summary;
  final String details;
  final TypeOfEventEnum type;
  final SpecialityEventEnum speciality;
  final TimeOfDay time;
  final bool isSynced;    // Sync Status

  DocumentModel({
    this.id,
    this.serverId,
    required this.title,
    required this.filePath,
    required this.isPDF,
    this.url = '',
    this.summary = '',
    this.details = '',
    this.type = TypeOfEventEnum.other,
    this.speciality = SpecialityEventEnum.other,
    this.time = const TimeOfDay(hour: 0, minute: 0),
    this.isSynced = false,
  });

  // --- ADD THIS METHOD TO FIX THE ERROR ---
  DocumentModel copyWith({
    String? id,
    String? serverId,
    bool? isSynced,
    String? title,
    String? filePath,
    // Add other fields if you ever need to update them
  }) {
    return DocumentModel(
      id: id ?? this.id,
      serverId: serverId ?? this.serverId,
      isSynced: isSynced ?? this.isSynced,
      title: title ?? this.title,
      filePath: filePath ?? this.filePath,
      isPDF: isPDF,
      url: url,
      summary: summary,
      details: details,
      type: type,
      speciality: speciality,
      time: time,
    );
  }
}
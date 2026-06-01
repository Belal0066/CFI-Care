import 'package:flutter/material.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

class DocumentModel {
  final String? id;
  final String? serverId;
  final String? jobId;
  final String title;
  final String filePath;
  final bool isPDF;
  final String url;
  final String summary;
  final String details;
  final TypeOfEventEnum type;
  final SpecialityEventEnum speciality;
  final TimeOfDay time;
  final bool isSynced;

  // DocOnFHIR pipeline state
  final String syncStatus;   // pending | job_submitted | synced | failed | user_retry_needed
  final double progress;     // 0.0 – 1.0
  final String? jobState;    // current API state: PENDING | OCR_PROCESSING | MAPPING | COMPLETED | FAILED
  final String? lastError;
  final int retryCount;

  DocumentModel({
    this.id,
    this.serverId,
    this.jobId,
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
    this.syncStatus = 'pending',
    this.progress = 0.0,
    this.jobState,
    this.lastError,
    this.retryCount = 0,
  });

  DocumentModel copyWith({
    String? id,
    String? serverId,
    String? jobId,
    bool? isSynced,
    String? title,
    String? filePath,
    String? syncStatus,
    double? progress,
    String? jobState,
    String? lastError,
    int? retryCount,
  }) {
    return DocumentModel(
      id: id ?? this.id,
      serverId: serverId ?? this.serverId,
      jobId: jobId ?? this.jobId,
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
      syncStatus: syncStatus ?? this.syncStatus,
      progress: progress ?? this.progress,
      jobState: jobState ?? this.jobState,
      lastError: lastError ?? this.lastError,
      retryCount: retryCount ?? this.retryCount,
    );
  }
}
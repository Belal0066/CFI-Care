import 'dart:async';
import '../models/document.dart';
import 'package:flutter/material.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

abstract class DocumentRepository {
  Stream<String> get documentStatusUpdates;
  Future<DocumentModel?> getDocumentById(String documentId);
  Future<List<DocumentModel>> getDocuments();
  Future<void> syncPendingDocuments();
  Future<void> retryDocument(String documentId);

  Future<DocumentModel> saveDocument({
    required String title,
    required String summary,
    required String details,
    required bool isPdf,
    required String tempFilePath,
    required TimeOfDay time,
    required TypeOfEventEnum type,
    required SpecialityEventEnum speciality,
  });
}

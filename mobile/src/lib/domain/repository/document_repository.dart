import '../models/document.dart';
import 'package:flutter/material.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

abstract class DocumentRepository {
  Future<List<DocumentModel>> getDocuments();
  Future<void> syncPendingDocuments();

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

import 'dart:io';
import 'package:flutter/material.dart';

// 1. IMPORT YOUR MODEL
import '../../domain/models/document.dart';
import '../../domain/repository/document_repository.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

// 2. IMPORT SERVICES
import '../services/pdf_storage_service.dart';
import '../services/image_storage_service.dart';
import '../services/datasources/api_service_booking.dart';

// 3. IMPORT DATABASE (Fixes 'DBHelper' and 'Session' errors)
import '../../database/db_helper.dart'; 

class DocumentRepositoryImpl implements DocumentRepository {
  final PdfStorageService pdfService;
  final ImageStorageService imageService;
  final ApiService apiService;

  DocumentRepositoryImpl(
    this.pdfService, 
    this.imageService, 
    this.apiService,
  );

  @override
  Future<DocumentModel> saveDocument({
    required String title,
    required String summary,
    required String details,
    required bool isPdf,
    required String tempFilePath,
    required TimeOfDay time,
    required TypeOfEventEnum type,
    required SpecialityEventEnum speciality,
  }) async {
    
    // 1. Save File Locally
    final savedPath = isPdf
        ? await pdfService.save(title: title, tempPath: tempFilePath)
        : await imageService.save(title: title, tempPath: tempFilePath);

    // 2. Create Model
    var newDoc = DocumentModel(
      title: title,
      filePath: savedPath,
      isPDF: isPdf,
      summary: summary,
      details: details,
      time: time,
      type: type,
      speciality: speciality,
      isSynced: false, 
    );

    // 3. Save to Local DB (Fixes Session and DBHelper error)
    final userId = Session.currentUserId ?? "guest"; 
    
    final localId = await DBHelper.insertDocument(userId, newDoc);
    
    // 4. Update Model with ID (Fixes copyWith error)
    newDoc = newDoc.copyWith(id: localId.toString());

    // 5. Sync to Server (Fixes uploadDocument error)
    try {
      final response = await apiService.uploadDocument(
        file: File(savedPath),
        title: title,
        type: type.name,
        specialty: speciality.name,
        date: DateTime.now().toIso8601String(),
        patientId: userId,
      );

      newDoc = newDoc.copyWith(
        isSynced: true,
        serverId: response['id'],
      );

      await DBHelper.updateDocument(newDoc);
      print("Synced successfully");

    } catch (e) {
      print("Sync failed, saved locally: $e");
    }

    return newDoc;
  }
}
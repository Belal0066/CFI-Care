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
  bool _isSyncing = false;

  DocumentRepositoryImpl(this.pdfService, this.imageService, this.apiService);

  @override
  Future<List<DocumentModel>> getDocuments() async {
    final userId = Session.currentApiUserId ?? Session.currentUserId ?? "guest";

    await syncPendingDocuments();

    final localDocs = await DBHelper.getDocumentsForUser(userId);

    final localByServerId = <String, DocumentModel>{
      for (final doc in localDocs)
        if ((doc.serverId ?? '').isNotEmpty) doc.serverId!: doc,
    };

    try {
      final bundle = await apiService.fetchDocumentReferencesByPatient(userId);
      final entries = (bundle['entry'] as List?) ?? const [];

      final remoteDocs = entries
          .map(
            (entry) => entry is Map<String, dynamic>
                ? entry['resource'] as Map<String, dynamic>?
                : null,
          )
          .whereType<Map<String, dynamic>>()
          .where((resource) => resource['resourceType'] == 'DocumentReference')
          .map(_documentFromDocumentReference)
          .map((remoteDoc) {
            final serverId = remoteDoc.serverId;
            if (serverId != null && localByServerId.containsKey(serverId)) {
              final localDoc = localByServerId[serverId]!;
              return remoteDoc.copyWith(filePath: localDoc.filePath);
            }
            return remoteDoc;
          })
          .toList();

      final unsyncedLocal = localDocs.where((doc) => !doc.isSynced).toList();
      return [...remoteDocs, ...unsyncedLocal];
    } catch (e) {
      print('Remote fetch failed, returning local docs only: $e');
      return DBHelper.getDocumentsForUser(userId);
    }
  }

  @override
  Future<void> syncPendingDocuments() async {
    if (_isSyncing) return;

    _isSyncing = true;
    final userId = Session.currentApiUserId ?? Session.currentUserId ?? "guest";
    try {
      final pendingDocs = await DBHelper.getPendingDocumentsForSync(userId);

      if (pendingDocs.isEmpty) return;

      for (final doc in pendingDocs) {
        final docId = doc.id;
        if (docId == null || docId.isEmpty) {
          continue;
        }

        await DBHelper.markDocumentSyncInProgress(docId);

        try {
          final localFile = File(doc.filePath);
          if (!await localFile.exists()) {
            throw Exception('Local file not found at ${doc.filePath}');
          }

          final response = await apiService.uploadDocument(
            file: localFile,
            title: doc.title,
            type: doc.type.name,
            specialty: doc.speciality.name,
            date: DateTime.now().toIso8601String(),
            patientId: userId,
            summary: doc.summary,
            details: doc.details,
          );

          final remoteId = response['id']?.toString();
          if (remoteId == null || remoteId.isEmpty) {
            throw Exception('Sync response missing id');
          }

          await DBHelper.markDocumentSyncSuccess(
            documentId: docId,
            serverId: remoteId,
          );
          print('Outbox sync succeeded for document $docId -> $remoteId');
        } catch (e) {
          await DBHelper.markDocumentSyncFailure(
            documentId: docId,
            error: e.toString(),
          );
          print('Outbox sync failed for document $docId: $e');
        }
      }
    } finally {
      _isSyncing = false;
    }
  }

  DocumentModel _documentFromDocumentReference(Map<String, dynamic> resource) {
    final contentList = (resource['content'] as List?) ?? const [];
    final firstContent = contentList.isNotEmpty && contentList.first is Map
        ? contentList.first as Map<String, dynamic>
        : const <String, dynamic>{};
    final attachment = firstContent['attachment'] is Map
        ? firstContent['attachment'] as Map<String, dynamic>
        : const <String, dynamic>{};

    final contentType = (attachment['contentType'] ?? '').toString();
    final url = (attachment['url'] ?? '').toString();
    final title = (attachment['title'] ?? resource['description'] ?? 'Document')
        .toString();

    final dateString = (resource['date'] ?? '').toString();
    final parsedDate = DateTime.tryParse(dateString) ?? DateTime.now();

    final type = _parseTypeFromDocumentReference(resource);
    final speciality = _parseSpecialityFromDocumentReference(resource);

    return DocumentModel(
      id: resource['id']?.toString(),
      serverId: resource['id']?.toString(),
      title: title,
      filePath: url,
      isPDF: contentType.toLowerCase().contains('pdf'),
      url: url,
      summary: (resource['description'] ?? '').toString(),
      details: '',
      type: type,
      speciality: speciality,
      time: TimeOfDay(hour: parsedDate.hour, minute: parsedDate.minute),
      isSynced: true,
    );
  }

  TypeOfEventEnum _parseTypeFromDocumentReference(
    Map<String, dynamic> resource,
  ) {
    final typeObj = resource['type'];
    if (typeObj is Map<String, dynamic>) {
      final text = (typeObj['text'] ?? '').toString().toLowerCase();
      if (text.contains('lab')) return TypeOfEventEnum.lab;
      if (text.contains('scan') || text.contains('imaging')) {
        return TypeOfEventEnum.scan;
      }
      if (text.contains('appointment') || text.contains('consult')) {
        return TypeOfEventEnum.appointment;
      }
      if (text.contains('surgery') || text.contains('operative')) {
        return TypeOfEventEnum.surgery;
      }

      final coding = (typeObj['coding'] as List?) ?? const [];
      for (final item in coding) {
        if (item is! Map<String, dynamic>) continue;
        final code = (item['code'] ?? '').toString();
        if (code == '11502-2') return TypeOfEventEnum.lab;
        if (code == '18748-4') return TypeOfEventEnum.scan;
        if (code == '11488-4') return TypeOfEventEnum.appointment;
        if (code == '11504-8') return TypeOfEventEnum.surgery;
      }
    }
    return TypeOfEventEnum.other;
  }

  SpecialityEventEnum _parseSpecialityFromDocumentReference(
    Map<String, dynamic> resource,
  ) {
    final categories = (resource['category'] as List?) ?? const [];
    if (categories.isEmpty || categories.first is! Map<String, dynamic>) {
      return SpecialityEventEnum.other;
    }

    final category = categories.first as Map<String, dynamic>;
    final text = (category['text'] ?? '').toString().toLowerCase();
    if (text.isNotEmpty) {
      return _specialityFromText(text);
    }

    final coding = (category['coding'] as List?) ?? const [];
    for (final item in coding) {
      if (item is! Map<String, dynamic>) continue;
      final display = (item['display'] ?? '').toString().toLowerCase();
      if (display.isNotEmpty) {
        return _specialityFromText(display);
      }
      final code = (item['code'] ?? '').toString();
      final byCode = _specialityFromCode(code);
      if (byCode != SpecialityEventEnum.other) {
        return byCode;
      }
    }

    return SpecialityEventEnum.other;
  }

  SpecialityEventEnum _specialityFromText(String value) {
    if (value.contains('cardio')) return SpecialityEventEnum.cardiology;
    if (value.contains('neuro')) return SpecialityEventEnum.neurology;
    if (value.contains('hemat')) return SpecialityEventEnum.hematology;
    if (value.contains('dermat')) return SpecialityEventEnum.dermatology;
    if (value.contains('dent')) return SpecialityEventEnum.dentistry;
    if (value.contains('pedi')) return SpecialityEventEnum.pediatrics;
    if (value.contains('ortho')) return SpecialityEventEnum.orthopedics;
    if (value.contains('psychi')) return SpecialityEventEnum.psychiatry;
    if (value.contains('uro')) return SpecialityEventEnum.urology;
    if (value.contains('onco')) return SpecialityEventEnum.oncology;
    return SpecialityEventEnum.other;
  }

  SpecialityEventEnum _specialityFromCode(String code) {
    switch (code) {
      case '394579002':
        return SpecialityEventEnum.cardiology;
      case '394591006':
        return SpecialityEventEnum.neurology;
      case '394598008':
        return SpecialityEventEnum.hematology;
      case '394582007':
        return SpecialityEventEnum.dermatology;
      case '394583002':
        return SpecialityEventEnum.dentistry;
      case '394537008':
        return SpecialityEventEnum.pediatrics;
      case '394801005':
        return SpecialityEventEnum.orthopedics;
      case '394587001':
        return SpecialityEventEnum.psychiatry;
      case '394612005':
        return SpecialityEventEnum.urology;
      case '394592004':
        return SpecialityEventEnum.oncology;
      default:
        return SpecialityEventEnum.other;
    }
  }

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
    final userId = Session.currentApiUserId ?? Session.currentUserId ?? "guest";

    final localId = await DBHelper.insertDocument(userId, newDoc);

    // 4. Update Model with ID (Fixes copyWith error)
    newDoc = newDoc.copyWith(id: localId.toString());

    // 5. Queue for outbox sync worker (local-first)
    await syncPendingDocuments();

    return newDoc;
  }
}

import 'dart:async';
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

  final Set<String> _pendingSummaryFetches = {};
  final Set<String> _activeStreamingJobs = {};
  final StreamController<String> _statusController =
      StreamController<String>.broadcast();

  @override
  Stream<String> get documentStatusUpdates => _statusController.stream;

  @override
  Future<DocumentModel?> getDocumentById(String documentId) =>
      DBHelper.getDocumentById(documentId);

  DocumentRepositoryImpl(this.pdfService, this.imageService, this.apiService);

  @override
  Future<List<DocumentModel>> getDocuments() async {
    final userId = Session.currentUserId ?? "guest";

    await syncPendingDocuments();

    final localDocs = await DBHelper.getDocumentsForUser(userId);

    final localByServerId = <String, DocumentModel>{
      for (final doc in localDocs)
        if ((doc.serverId ?? '').isNotEmpty) doc.serverId!: doc,
    };

    try {
      final fhirId = Session.fhirPatientId ?? userId;
      final bundle = await apiService.fetchDocumentReferencesByPatient(fhirId);
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
              return remoteDoc.copyWith(
                // Prefer local file path (HAPI FHIR only stores a remote URL)
                filePath: localDoc.filePath.isNotEmpty ? localDoc.filePath : null,
                // Prefer the AI summary stored in the local DB
                summary: localDoc.summary.isNotEmpty ? localDoc.summary : null,
                // Carry the pipeline job ID so the detail screen can display it
                jobId: localDoc.jobId,
              );
            }
            return remoteDoc;
          })
          .toList();

      // Include all local docs not already represented in the remote result.
      // This covers (a) unsynced docs and (b) synced docs whose remote record
      // isn't queryable yet (cache stale, HAPI indexing lag, etc.).
      final remoteServerIds = remoteDocs
          .where((d) => (d.serverId ?? '').isNotEmpty)
          .map((d) => d.serverId!)
          .toSet();
      final localNotInRemote = localDocs
          .where((doc) {
            final sid = doc.serverId ?? '';
            return sid.isEmpty || !remoteServerIds.contains(sid);
          })
          .toList();

      final allDocs = [...remoteDocs, ...localNotInRemote];

      // For synced docs whose summary hasn't been cached yet, fetch it from
      // Node.js in the background. The guard prevents duplicate in-flight
      // requests; the result is saved to SQLite and picked up on the next refresh.
      for (final doc in allDocs) {
        final sid = doc.serverId ?? '';
        final docId = doc.id ?? '';
        if (doc.isSynced && doc.summary.isEmpty && sid.isNotEmpty && docId.isNotEmpty) {
          _fetchAndCacheSummary(docId: docId, serverId: sid);
        }
      }

      return allDocs;
    } catch (e) {
      print('Remote fetch failed, returning local docs only: $e');
      return DBHelper.getDocumentsForUser(userId);
    }
  }

  @override
  Future<void> syncPendingDocuments() async {
    if (_isSyncing) return;

    _isSyncing = true;
    final userId = Session.currentUserId ?? "guest";
    try {
      final pendingDocs = await DBHelper.getPendingDocumentsForSync(userId);
      if (pendingDocs.isEmpty) return;

      for (final doc in pendingDocs) {
        final docId = doc.id;
        if (docId == null || docId.isEmpty) continue;

        final existingJobId = doc.jobId;

        // Phase 2: job already submitted — attach stream if not already active
        if (existingJobId != null && existingJobId.isNotEmpty) {
          if (!_activeStreamingJobs.contains(existingJobId)) {
            unawaited(_streamDocOnFhirJob(
                docId: docId, jobId: existingJobId, retryCount: doc.retryCount));
          }
          continue;
        }

        // Phase 1: upload file to DocOnFHIR and obtain a job_id
        await DBHelper.markDocumentSyncInProgress(docId);
        try {
          final localFile = File(doc.filePath);
          if (!await localFile.exists()) {
            throw Exception('Local file not found at ${doc.filePath}');
          }

          final submittedJobId = await apiService.uploadToDocOnFhir(
            file: localFile,
            patientId: Session.fhirPatientId ?? userId,
            pdfId: docId,
          );

          await DBHelper.markDocumentJobSubmitted(
            documentId: docId,
            jobId: submittedJobId,
          );
          // Notify UI immediately so the card transitions pending → job_submitted
          // without waiting for the first WebSocket event.
          _statusController.add(docId);
          print('[sync] DocOnFHIR upload queued: doc=$docId job=$submittedJobId');

          // Start streaming in background — returns immediately
          unawaited(_streamDocOnFhirJob(
              docId: docId, jobId: submittedJobId, retryCount: 0));
        } catch (e) {
          await DBHelper.markDocumentSyncFailure(
            documentId: docId,
            error: e.toString(),
          );
          print('[sync] DocOnFHIR upload failed for doc=$docId: $e');
        }
      }
    } finally {
      _isSyncing = false;
    }
  }

  /// Streams real-time status events from the FastAPI WebSocket endpoint.
  /// Falls back to a single HTTP poll if the WebSocket connection cannot be
  /// established (e.g. the gateway is unreachable or the job is already done).
  Future<void> _streamDocOnFhirJob({
    required String docId,
    required String jobId,
    required int retryCount,
  }) async {
    // Synchronous — runs before first await so the guard is set instantly.
    _activeStreamingJobs.add(jobId);
    bool receivedAnyEvent = false;

    try {
      await for (final status in apiService.streamDocOnFhirJobStatus(jobId)) {
        receivedAnyEvent = true;

        await DBHelper.updateDocumentProgress(
          documentId: docId,
          progress: status.progress,
          jobState: status.state,
        );
        _statusController.add(docId);

        print('[stream] DocOnFHIR job=$jobId state=${status.state} progress=${status.progress}');

        if (status.isCompleted) {
          await _handleJobCompleted(docId: docId, jobId: jobId);
          _statusController.add(docId);
          return;
        }

        if (status.isFailed) {
          await _handleJobFailed(
              docId: docId, jobId: jobId, retryCount: retryCount, status: status);
          _statusController.add(docId);
          return;
        }
      }
    } catch (e) {
      print('[stream] DocOnFHIR stream error job=$jobId: $e');
    } finally {
      _activeStreamingJobs.remove(jobId);
    }

    // WebSocket either never connected or dropped mid-stream without a terminal
    // event — fall back to a single HTTP poll so the sync cycle is not lost.
    if (!receivedAnyEvent) {
      await _fallbackPoll(docId: docId, jobId: jobId, retryCount: retryCount);
      _statusController.add(docId);
    }
  }

  Future<void> _handleJobCompleted({
    required String docId,
    required String jobId,
  }) async {
    try {
      final result = await apiService.getDocOnFhirJobResult(jobId);
      final serverId = _extractServerIdFromResult(result) ?? jobId;

      // Mark the document synced first so the UI can update immediately
      await DBHelper.markDocumentSyncSuccess(
        documentId: docId,
        serverId: serverId,
      );
      print('[stream] DocOnFHIR completed: doc=$docId job=$jobId serverId=$serverId');

      // Fetch the AI summary from the FHIR Composition via Node.js.
      // Node.js queries HAPI FHIR using the pdf_id identifier stamped on the
      // Composition during pipeline processing.
      if (serverId.isNotEmpty) {
        await _fetchAndCacheSummary(docId: docId, serverId: serverId);
      }
    } catch (e) {
      print('[stream] DocOnFHIR result fetch error job=$jobId: $e');
    }
  }

  /// Fetches the AI summary from the Node.js → HAPI FHIR Composition endpoint
  /// and persists it to local SQLite. Safe to call concurrently — the
  /// [_pendingSummaryFetches] guard prevents duplicate in-flight requests.
  Future<void> _fetchAndCacheSummary({
    required String docId,
    required String serverId,
  }) async {
    if (_pendingSummaryFetches.contains(serverId)) return;
    _pendingSummaryFetches.add(serverId);
    try {
      final aiSummary = await apiService.fetchDocumentSummary(serverId);
      if (aiSummary != null && aiSummary.isNotEmpty) {
        await DBHelper.markDocumentSyncSuccess(
          documentId: docId,
          serverId: serverId,
          summary: aiSummary,
        );
        print('[summary] Saved from Node.js: doc=$docId length=${aiSummary.length}');
      }
    } catch (e) {
      print('[summary] Fetch error: doc=$docId serverId=$serverId: $e');
    } finally {
      _pendingSummaryFetches.remove(serverId);
    }
  }

  Future<void> _handleJobFailed({
    required String docId,
    required String jobId,
    required int retryCount,
    required status,
  }) async {
    final error = (status.errorMessage as String?) ?? 'DocOnFHIR pipeline failed';
    if (retryCount < 2) {
      await DBHelper.resetDocumentForAutoRetry(docId);
      print('[stream] DocOnFHIR job failed, auto-retry ${retryCount + 1}/2: doc=$docId');
    } else {
      await DBHelper.markNeedsUserRetry(documentId: docId, error: error);
      print('[stream] DocOnFHIR job failed after 2 retries, needs user retry: doc=$docId');
    }
  }

  /// Single HTTP poll — used only when the WebSocket is unavailable.
  Future<void> _fallbackPoll({
    required String docId,
    required String jobId,
    required int retryCount,
  }) async {
    try {
      final status = await apiService.getDocOnFhirJobStatusDetails(jobId);
      await DBHelper.updateDocumentProgress(
        documentId: docId,
        progress: status.progress,
        jobState: status.state,
      );
      if (status.isCompleted) {
        await _handleJobCompleted(docId: docId, jobId: jobId);
      } else if (status.isFailed) {
        await _handleJobFailed(docId: docId, jobId: jobId, retryCount: retryCount, status: status);
      } else {
        print('[fallback-poll] DocOnFHIR job=$jobId state=${status.state} progress=${status.progress}');
      }
    } catch (e) {
      print('[fallback-poll] DocOnFHIR network error job=$jobId: $e');
    }
  }

  @override
  Future<void> retryDocument(String documentId) async {
    await DBHelper.resetDocumentForManualRetry(documentId);
    await syncPendingDocuments();
  }


  /// Extracts a FHIR resource ID from the DocOnFHIR result to use as serverId.
  /// Prefers a DocumentReference ID from the FHIR bundle, falls back to
  /// the first entry in created_resources from the COMPLETED event.
  String? _extractServerIdFromResult(Map<String, dynamic> result) {
    final fhirBundle = result['fhir_bundle'] as Map<String, dynamic>?;
    if (fhirBundle != null) {
      final entries = (fhirBundle['entry'] as List?) ?? [];
      for (final entry in entries) {
        if (entry is! Map) continue;
        final resource = entry['resource'] as Map<String, dynamic>?;
        if (resource != null && resource['resourceType'] == 'DocumentReference') {
          final id = resource['id']?.toString();
          if (id != null && id.isNotEmpty) return id;
        }
      }
    }

    final events = (result['events'] as List?) ?? [];
    for (final event in events.reversed) {
      if (event is! Map) continue;
      final payload = event['payload'] as Map?;
      if (payload == null) continue;
      final created = payload['created_resources'];
      if (created is List && created.isNotEmpty) {
        return created.first.toString();
      }
    }

    return null;
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
      summary: '',  // AI summary comes from local DB (set by fetchDocumentSummary), not DocumentReference.description
      details: '',
      type: type,
      speciality: speciality,
      time: TimeOfDay(hour: parsedDate.hour, minute: parsedDate.minute),
      isSynced: true,
      syncStatus: 'synced',
      progress: 1.0,
      jobState: 'COMPLETED',
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
    final userId = Session.currentUserId ?? "guest";

    final localId = await DBHelper.insertDocument(userId, newDoc);

    // 4. Update Model with ID (Fixes copyWith error)
    newDoc = newDoc.copyWith(id: localId);

    return newDoc; // Caller triggers sync; keeps saveDocument fast
  }
}

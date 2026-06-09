import 'dart:async';
import 'package:flutter/material.dart';
import '../../domain/models/document.dart';
import '../../domain/repository/document_repository.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

class DocumentProvider extends ChangeNotifier {
  final DocumentRepository repository;

  List<DocumentModel> _documents = [];
  bool _isLoading = false;
  String? _error;
  Timer? _syncTimer;

  // Docs that exhausted auto-retries and need explicit user action
  final List<DocumentModel> _pendingUserRetry = [];

  bool _isMockMode = false;
  StreamSubscription<String>? _statusSubscription;

  List<DocumentModel> get documents => _documents;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isMockMode => _isMockMode;
  List<DocumentModel> get docsNeedingRetry => List.unmodifiable(_pendingUserRetry);

  DocumentProvider(this.repository) {
    _startAutoSyncLoop();
    _statusSubscription =
        repository.documentStatusUpdates.listen(_onDocumentStatusChanged);
  }

  Future<void> _onDocumentStatusChanged(String docId) async {
    final updated = await repository.getDocumentById(docId);
    if (updated == null) return;
    final idx = _documents.indexWhere((d) => d.id == docId);
    if (idx < 0) return; // not in list yet — fetchDocuments will pick it up
    _documents[idx] = updated;
    _refreshPendingUserRetry();
    notifyListeners();
  }

  void _startAutoSyncLoop() {
    _syncTimer?.cancel();
    // Fallback timer: picks up any jobs that lost their WebSocket connection
    // (app resumed from background, network blip, app restart with in-flight jobs).
    // Active jobs are driven by the WebSocket stream in the repository layer;
    // this timer only matters for orphaned jobs that have no live stream.
    _syncTimer = Timer.periodic(const Duration(minutes: 5), (_) async {
      try {
        await repository.syncPendingDocuments();
      } catch (e) {
        print('Periodic document sync failed: $e');
      }
    });
  }

  // // --- STATE ---
  // final List<DocumentModel> _documents = []; // Stores the list of uploaded docs
  // bool _isLoading = false;
  // String? _error;

  // // --- GETTERS ---
  // List<DocumentModel> get documents => _documents;
  // bool get isLoading => _isLoading;
  // String? get error => _error;

  // --- ACTIONS ---
  Future<void> fetchDocuments() async {
    _isLoading = true;
    notifyListeners();

    try {
      await repository.syncPendingDocuments();
      _documents = await repository.getDocuments();
      _refreshPendingUserRetry();
    } catch (e) {
      _error = e.toString();
      print("Error fetching docs: $e");
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> retryDocument(String documentId) async {
    if (_isMockMode) {
      _documents = _documents.map((d) {
        if (d.id != documentId) return d;
        return d.copyWith(
          syncStatus: 'job_submitted',
          jobState: 'PENDING',
          progress: 0.0,
          lastError: null,
          retryCount: 0,
        );
      }).toList();
      _refreshPendingUserRetry();
      notifyListeners();
      return;
    }
    try {
      await repository.retryDocument(documentId);
      _documents = await repository.getDocuments();
      _refreshPendingUserRetry();
    } catch (e) {
      _error = e.toString();
    } finally {
      notifyListeners();
    }
  }

  void loadMockDocuments() {
    _isMockMode = true;
    _documents = [
      DocumentModel(
        id: 'mock-1',
        title: 'CBC Lab Report',
        filePath: '/mock/cbc.pdf',
        isPDF: true,
        type: TypeOfEventEnum.lab,
        speciality: SpecialityEventEnum.hematology,
        time: const TimeOfDay(hour: 9, minute: 30),
        isSynced: true,
        syncStatus: 'synced',
        progress: 1.0,
        jobState: 'COMPLETED',
        summary:
            'WBC 7.5 10*3/uL · Hemoglobin 14.2 g/dL · Platelets 250 10*3/uL. '
            'All values within normal reference ranges.',
      ),
      DocumentModel(
        id: 'mock-2',
        title: 'Chest X-Ray',
        filePath: '/mock/xray.pdf',
        isPDF: true,
        type: TypeOfEventEnum.scan,
        speciality: SpecialityEventEnum.other,
        time: const TimeOfDay(hour: 11, minute: 0),
        isSynced: false,
        syncStatus: 'job_submitted',
        jobId: 'job_mock_ocr',
        progress: 0.35,
        jobState: 'OCR_PROCESSING',
      ),
      DocumentModel(
        id: 'mock-3',
        title: 'Cardiology Consultation',
        filePath: '/mock/cardio.pdf',
        isPDF: true,
        type: TypeOfEventEnum.appointment,
        speciality: SpecialityEventEnum.cardiology,
        time: const TimeOfDay(hour: 14, minute: 15),
        isSynced: false,
        syncStatus: 'job_submitted',
        jobId: 'job_mock_map',
        progress: 0.70,
        jobState: 'MAPPING',
      ),
      DocumentModel(
        id: 'mock-4',
        title: 'Prescription — Amoxicillin',
        filePath: '/mock/rx.pdf',
        isPDF: true,
        type: TypeOfEventEnum.other,
        speciality: SpecialityEventEnum.other,
        time: const TimeOfDay(hour: 8, minute: 0),
        isSynced: false,
        syncStatus: 'job_submitted',
        jobId: 'job_mock_pending',
        progress: 0.0,
        jobState: 'PENDING',
      ),
      DocumentModel(
        id: 'mock-5',
        title: 'MRI Brain Scan',
        filePath: '/mock/mri.pdf',
        isPDF: true,
        type: TypeOfEventEnum.scan,
        speciality: SpecialityEventEnum.neurology,
        time: const TimeOfDay(hour: 16, minute: 45),
        isSynced: false,
        syncStatus: 'user_retry_needed',
        jobId: 'job_mock_failed',
        lastError: 'OCR stage exceeded maximum allowed time (stage_timeout).',
        retryCount: 2,
      ),
      DocumentModel(
        id: 'mock-6',
        title: 'Surgical Report — Appendectomy',
        filePath: '/mock/surgery.pdf',
        isPDF: true,
        type: TypeOfEventEnum.surgery,
        speciality: SpecialityEventEnum.other,
        time: const TimeOfDay(hour: 10, minute: 0),
        isSynced: false,
        syncStatus: 'pending',
        progress: 0.0,
      ),
    ];
    _refreshPendingUserRetry();
    notifyListeners();
  }

  void _refreshPendingUserRetry() {
    _pendingUserRetry
      ..clear()
      ..addAll(
        _documents.where((d) => d.syncStatus == 'user_retry_needed'),
      );
  }

  // 1. Save Document Function
  Future<bool> addDocument({
    required String title,
    required String summary,
    required String details,
    required bool isPdf,
    required String tempFilePath,
    required TimeOfDay time,
    required TypeOfEventEnum type,
    required SpecialityEventEnum speciality,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final newDoc = await repository.saveDocument(
        title: title,
        summary: summary,
        details: details,
        isPdf: isPdf,
        tempFilePath: tempFilePath,
        time: time,
        type: type,
        speciality: speciality,
      );

      // Show the document immediately as pending — real-time updates arrive via the stream.
      _documents.add(newDoc);
      _isLoading = false;
      notifyListeners();
      // Upload + stream in background; stream events drive all subsequent status changes.
      unawaited(repository.syncPendingDocuments());
      return true;
    } catch (e) {
      _isLoading = false;
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  @override
  void dispose() {
    _statusSubscription?.cancel();
    _syncTimer?.cancel();
    super.dispose();
  }
}

import 'dart:async';
import 'package:flutter/material.dart';
import '../../domain/models/document.dart';
import '../../domain/repository/document_repository.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

class DocumentProvider extends ChangeNotifier {
  final DocumentRepository
  repository; // Make sure this is using the Interface or Impl

  List<DocumentModel> _documents = [];
  bool _isLoading = false;
  String? _error;
  Timer? _syncTimer;

  List<DocumentModel> get documents => _documents;
  bool get isLoading => _isLoading;
  String? get error => _error;

  DocumentProvider(this.repository) {
    _startAutoSyncLoop();
  }

  void _startAutoSyncLoop() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(seconds: 90), (_) async {
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
    } catch (e) {
      _error = e.toString();
      print("Error fetching docs: $e");
    } finally {
      _isLoading = false;
      notifyListeners();
    }
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
    notifyListeners(); // Update UI to show spinner

    try {
      // Call the repository
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

      // Add to our local list so we can show it in the app immediately
      _documents.add(newDoc);

      if (!newDoc.isSynced) {
        await repository.syncPendingDocuments();
      }

      _isLoading = false;
      notifyListeners(); // Update UI to show success
      return true;
    } catch (e) {
      _isLoading = false;
      _error = e.toString();
      notifyListeners(); // Update UI to show error
      return false;
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }
}

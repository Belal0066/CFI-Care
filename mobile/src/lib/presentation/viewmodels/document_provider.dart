import 'package:flutter/material.dart';
import '../../domain/models/document.dart';
import '../../domain/repository/document_repository.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

class DocumentProvider extends ChangeNotifier {
  final DocumentRepository repository; // Make sure this is using the Interface or Impl


  List<DocumentModel> _documents = [];
  bool _isLoading = false;
  String? _error;

  List<DocumentModel> get documents => _documents;
  bool get isLoading => _isLoading;
  String? get error => _error;

  DocumentProvider(this.repository);

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
      // We cast repository to the Implementation to access 'getDocuments'
      // OR you should add 'getDocuments' to your abstract DocumentRepository interface.
      // Assuming you added it to the Interface:
      _documents = await (repository as dynamic).getDocuments();
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
}

import 'package:flutter/material.dart';
import '../../domain/repository/patient_repository.dart';

class PatientProvider with ChangeNotifier {
  final PatientRepository repository;
  PatientProvider(this.repository);

  PatientProfile? _profile;
  bool _isLoading = false;
  bool _isSaving = false;
  String? _loadError;
  String? _saveError;

  PatientProfile? get profile => _profile;
  bool get isLoading => _isLoading;
  bool get isSaving => _isSaving;
  String? get loadError => _loadError;
  String? get saveError => _saveError;

  Future<void> fetchProfile(String patientId) async {
    _isLoading = true;
    _loadError = null;
    notifyListeners();
    try {
      _profile = await repository.fetchPatient(patientId);
    } catch (e) {
      _loadError = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> saveProfile(PatientProfile profile) async {
    _isSaving = true;
    _saveError = null;
    notifyListeners();
    try {
      await repository.updatePatient(profile);
      _profile = profile;
      return true;
    } catch (e) {
      _saveError = e.toString();
      return false;
    } finally {
      _isSaving = false;
      notifyListeners();
    }
  }
}

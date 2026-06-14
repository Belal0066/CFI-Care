import 'package:flutter/material.dart';
import '../../domain/models/vitals.dart';
import '../../data/repositories/vitals_repo.dart';

class VitalsProvider extends ChangeNotifier {
  final VitalsRepository repository;

  VitalsProvider(this.repository);

  List<VitalSign> _vitals = [];
  bool _isLoading = false;

  List<VitalSign> get vitals => _vitals;
  bool get isLoading => _isLoading;

  Future<void> loadVitals() async {
    _isLoading = true;
    notifyListeners();

    try {
      _vitals = await repository.fetchVitalSigns();
    } catch (e) {
      print("Error loading vitals: $e");
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
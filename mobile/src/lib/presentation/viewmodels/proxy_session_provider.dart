import 'package:flutter/material.dart';

class ProxySessionProvider with ChangeNotifier {
  String? _proxyPatientId;
  String? _proxyPatientName;

  bool get isProxying => _proxyPatientId != null;
  String? get proxyPatientId => _proxyPatientId;
  String? get proxyPatientName => _proxyPatientName;

  void switchTo(String patientId, String name) {
    _proxyPatientId = patientId;
    _proxyPatientName = name;
    notifyListeners();
  }

  void switchBack() {
    _proxyPatientId = null;
    _proxyPatientName = null;
    notifyListeners();
  }
}

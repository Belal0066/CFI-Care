import 'package:flutter/material.dart';
import '../../domain/models/grant_model.dart';
import '../../domain/repository/access_grant_repository.dart';

class AccessGrantProvider with ChangeNotifier {
  final AccessGrantRepository repository;

  AccessGrantProvider(this.repository);

  // OTP state
  OtpResponse? _otp;
  bool _isRequestingOtp = false;
  String? _otpError;

  OtpResponse? get otp => _otp;
  bool get isRequestingOtp => _isRequestingOtp;
  String? get otpError => _otpError;

  // Pending grants state
  List<PendingGrant> _pendingGrants = [];
  bool _isLoadingPending = false;
  String? _pendingError;

  List<PendingGrant> get pendingGrants => _pendingGrants;
  bool get isLoadingPending => _isLoadingPending;
  String? get pendingError => _pendingError;

  // Active grants state
  List<Grant> _activeGrants = [];
  bool _isLoadingActive = false;
  String? _activeError;

  List<Grant> get activeGrants => _activeGrants;
  bool get isLoadingActive => _isLoadingActive;
  String? get activeError => _activeError;

  // Requeter name cache (id to display name)
  final Map<String, String> _requesterNames = {};


  String requesterName(String id) => _requesterNames[id] ?? id;


  Future<void> _cacheNames(List<String> ids) async {
    final uncached = ids.toSet().where((id) => !_requesterNames.containsKey(id)).toList();
    if (uncached.isEmpty) return;
    await Future.wait(uncached.map((id) async {
      final name = await repository.fetchPractitionerName(id);
      if (name != null) _requesterNames[id] = name;
    }));
    notifyListeners();
  }

  Future<void> requestOtp() async {
    _isRequestingOtp = true;
    _otpError = null;
    _otp = null;
    notifyListeners();
    try {
      _otp = await repository.requestOtp();
    } catch (e) {
      _otpError = e.toString();
    } finally {
      _isRequestingOtp = false;
      notifyListeners();
    }
  }

  void clearOtp() {
    _otp = null;
    _otpError = null;
    notifyListeners();
  }

  Future<void> fetchPendingGrants() async {
    _isLoadingPending = true;
    _pendingError = null;
    notifyListeners();
    try {
      _pendingGrants = await repository.getPendingGrants();
      await _cacheNames(_pendingGrants.map((g) => g.requesterId).toList());
    } catch (e) {
      _pendingError = e.toString();
    } finally {
      _isLoadingPending = false;
      notifyListeners();
    }
  }

  Future<bool> respondToGrant({
    required String handshakeId,
    required bool approved,
    int durationMinutes = 60,
    List<String> scopes = const ['read'],
  }) async {
    try {
      await repository.respondToGrant(
        handshakeId: handshakeId,
        approved: approved,
        durationMinutes: durationMinutes,
        scopes: scopes,
      );
      _pendingGrants.removeWhere((g) => g.handshakeId == handshakeId);
      notifyListeners();
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> fetchActiveGrants() async {
    _isLoadingActive = true;
    _activeError = null;
    notifyListeners();
    try {
      _activeGrants = await repository.getActiveGrants();
      await _cacheNames(_activeGrants.map((g) => g.requesterId).toList());
    } catch (e) {
      _activeError = e.toString();
    } finally {
      _isLoadingActive = false;
      notifyListeners();
    }
  }

  Future<bool> revokeGrant(String practitionerId) async {
    try {
      await repository.revokeGrant(practitionerId);
      _activeGrants.removeWhere((g) => g.requesterId == practitionerId);
      notifyListeners();
      return true;
    } catch (e) {
      return false;
    }
  }
}

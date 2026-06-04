import 'package:flutter/material.dart';
import '../../domain/models/family_access_model.dart';
import '../../domain/repository/family_access_repository.dart';

class FamilyAccessProvider with ChangeNotifier {
  final FamilyAccessRepository repository;

  FamilyAccessProvider(this.repository);

  // --- Y's accessible patients (patients Y can proxy-view) ---
  List<FamilyMember> _accessibleMembers = [];
  bool _isLoadingMembers = false;
  String? _membersError;

  List<FamilyMember> get accessibleMembers => _accessibleMembers;
  bool get isLoadingMembers => _isLoadingMembers;
  String? get membersError => _membersError;

  // --- X's pending requests from family members (Y's waiting for approval) ---
  List<PendingFamilyRequest> _pendingRequests = [];
  bool _isLoadingPending = false;

  List<PendingFamilyRequest> get pendingRequests => _pendingRequests;
  bool get isLoadingPending => _isLoadingPending;

  // --- X's active family accessors (Y's who currently have access to X's data) ---
  List<FamilyAccessor> _familyAccessors = [];
  bool _isLoadingAccessors = false;
  String? _accessorsError;

  List<FamilyAccessor> get familyAccessors => _familyAccessors;
  bool get isLoadingAccessors => _isLoadingAccessors;
  String? get accessorsError => _accessorsError;

  // --- Y submitting X's code ---
  bool _isSubmitting = false;
  String? _submitError;

  bool get isSubmitting => _isSubmitting;
  String? get submitError => _submitError;

  Future<bool> submitCode(String code) async {
    _isSubmitting = true;
    _submitError = null;
    notifyListeners();
    try {
      await repository.submitFamilyCode(code);
      return true;
    } catch (e) {
      _submitError = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _isSubmitting = false;
      notifyListeners();
    }
  }

  void clearSubmitError() {
    _submitError = null;
    notifyListeners();
  }

  Future<void> fetchAccessibleMembers() async {
    _isLoadingMembers = true;
    _membersError = null;
    notifyListeners();
    try {
      _accessibleMembers = await repository.getAccessibleMembers();
    } catch (e) {
      _membersError = e.toString().replaceFirst('Exception: ', '');
    } finally {
      _isLoadingMembers = false;
      notifyListeners();
    }
  }

  Future<void> fetchPendingRequests() async {
    _isLoadingPending = true;
    notifyListeners();
    try {
      _pendingRequests = await repository.getPendingFamilyRequests();
    } catch (_) {
      // silently ignore — pending section stays empty
    } finally {
      _isLoadingPending = false;
      notifyListeners();
    }
  }

  Future<bool> respondToRequest(String handshakeId, bool approved) async {
    try {
      await repository.respondToFamilyRequest(
        handshakeId: handshakeId,
        approved: approved,
      );
      _pendingRequests.removeWhere((r) => r.handshakeId == handshakeId);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> fetchFamilyAccessors() async {
    _isLoadingAccessors = true;
    _accessorsError = null;
    notifyListeners();
    try {
      _familyAccessors = await repository.getFamilyAccessors();
    } catch (e) {
      _accessorsError = e.toString().replaceFirst('Exception: ', '');
    } finally {
      _isLoadingAccessors = false;
      notifyListeners();
    }
  }

  Future<bool> revokeFamilyAccessor(String caregiverId) async {
    try {
      await repository.revokeFamilyAccess(caregiverId);
      _familyAccessors.removeWhere((a) => a.requesterId == caregiverId);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }
}

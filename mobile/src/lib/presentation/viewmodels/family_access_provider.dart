import 'package:flutter/material.dart';
import '../../domain/models/family_access_model.dart';
import '../../domain/repository/family_access_repository.dart';

class FamilyAccessProvider with ChangeNotifier {
  final FamilyAccessRepository repository;

  FamilyAccessProvider(this.repository);

  // --- Accessible members (x's list of patients x can view) ---
  List<FamilyMember> _accessibleMembers = [];
  bool _isLoadingMembers = false;
  String? _membersError;

  List<FamilyMember> get accessibleMembers => _accessibleMembers;
  bool get isLoadingMembers => _isLoadingMembers;
  String? get membersError => _membersError;

  // --- Pending family requests (y's incoming requests) ---
  List<PendingFamilyRequest> _pendingRequests = [];
  bool _isLoadingPending = false;

  List<PendingFamilyRequest> get pendingRequests => _pendingRequests;
  bool get isLoadingPending => _isLoadingPending;

  // --- Code submission (x submits y's OTP) ---
  bool _isSubmitting = false;
  String? _submitError;

  bool get isSubmitting => _isSubmitting;
  String? get submitError => _submitError;

  Future<bool> submitCode(String code) async {
    _isSubmitting = true;
    _submitError = null;
    notifyListeners();
    // TODO: remove this stub when backend is ready
    await Future.delayed(const Duration(seconds: 1));
    _isSubmitting = false;
    notifyListeners();
    return true;

    // TODO: uncomment when backend is ready
    // try {
    //   await repository.submitFamilyCode(code);
    //   return true;
    // } catch (e) {
    //   _submitError = e.toString().replaceFirst('Exception: ', '');
    //   return false;
    // } finally {
    //   _isSubmitting = false;
    //   notifyListeners();
    // }
  }

  void clearSubmitError() {
    _submitError = null;
    notifyListeners();
  }

  Future<void> fetchAccessibleMembers() async {
    _isLoadingMembers = true;
    _membersError = null;
    notifyListeners();

    // TODO: remove this stub when backend is ready
    await Future.delayed(const Duration(milliseconds: 300));
    _accessibleMembers = [
      FamilyMember(patientId: 'fake-id', name: 'Martha Doe', grantId: 'g1'),
    ];
    _isLoadingMembers = false;
    notifyListeners();

    // TODO: uncomment when backend is ready
    // try {
    //   _accessibleMembers = await repository.getAccessibleMembers();
    // } catch (e) {
    //   _membersError = e.toString().replaceFirst('Exception: ', '');
    // } finally {
    //   _isLoadingMembers = false;
    //   notifyListeners();
    // }
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
}

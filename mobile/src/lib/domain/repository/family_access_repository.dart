import 'dart:convert';
import '../../data/services/datasources/api_service_booking.dart';
import '../models/family_access_model.dart';

class FamilyAccessRepository {
  final ApiService apiService;

  FamilyAccessRepository(this.apiService);

  // Y (family member) submits X's OTP code to request proxy access.
  // Backend: POST /api/handshakes/verify-caregiver-otp { otp }
  Future<void> submitFamilyCode(String otp) async {
    final response = await apiService.postData(
      endpoint: '/handshakes/verify-caregiver-otp',
      data: {'otp': otp},
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      final body = json.decode(response.body) as Map<String, dynamic>?;
      throw Exception(body?['error'] ?? 'Invalid code or request failed');
    }
  }

  // Y gets the list of patients (X's) they can access.
  // Backend: GET /api/caregiver-grants/my-patients → { patients: [...] }
  Future<List<FamilyMember>> getAccessibleMembers() async {
    final response = await apiService.getData(
      endpoint: '/caregiver-grants/my-patients',
    );
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['patients'] as List<dynamic>? ?? [];
      return list
          .map((e) => FamilyMember.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to fetch accessible family members: ${response.body}');
  }

  // X gets the list of pending caregiver access requests (from Y's).
  // Backend: GET /api/handshakes/pending → { pending: [...] }
  // Filters to only caregiver-type requests.
  Future<List<PendingFamilyRequest>> getPendingFamilyRequests() async {
    final response = await apiService.getData(endpoint: '/handshakes/pending');
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['pending'] as List<dynamic>? ?? [];
      return list
          .map((e) => PendingFamilyRequest.fromJson(e as Map<String, dynamic>))
          .where((r) => r.isFamilyRequest)
          .toList();
    }
    throw Exception('Failed to fetch pending family requests: ${response.body}');
  }

  // X approves or denies Y's request.
  // Backend: POST /api/handshakes/create-grant { handshakeId, approved, durationMinutes? }
  Future<void> respondToFamilyRequest({
    required String handshakeId,
    required bool approved,
    int durationMinutes = 60 * 24 * 365, // ~1 year default for family access
  }) async {
    final response = await apiService.postData(
      endpoint: '/handshakes/create-grant',
      data: {
        'handshakeId': handshakeId,
        'approved': approved,
        if (approved) 'durationMinutes': durationMinutes,
        if (approved) 'scopes': ['read', 'write'],
      },
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Failed to respond to family request: ${response.body}');
    }
  }

  // X gets the list of family members (Y's) who currently have access to their data.
  // Backend: GET /api/patient-grants/grants → { practitioners: [...], caregivers: [...] }
  Future<List<FamilyAccessor>> getFamilyAccessors() async {
    final response = await apiService.getData(
      endpoint: '/patient-grants/grants',
    );
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['caregivers'] as List<dynamic>? ?? [];
      return list
          .map((e) => FamilyAccessor.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to fetch family accessors: ${response.body}');
  }

  // X revokes Y's access.
  // Backend: DELETE /api/patient-grants/caregivers/:caregiverId
  Future<void> revokeFamilyAccess(String caregiverId) async {
    final response = await apiService.deleteData(
      endpoint: '/patient-grants/caregivers/$caregiverId',
    );
    if (response.statusCode != 200) {
      throw Exception('Failed to revoke family access: ${response.body}');
    }
  }
}

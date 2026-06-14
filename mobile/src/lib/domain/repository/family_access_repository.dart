import 'dart:convert';
import '../../data/services/datasources/api_service_booking.dart';
import '../models/family_access_model.dart';

class FamilyAccessRepository {
  final ApiService apiService;

  FamilyAccessRepository(this.apiService);

  // TODO(backend): POST /family-access/submit-code  body: { otp: string }
  // Returns 200/201 on success; throws on invalid code.
  Future<void> submitFamilyCode(String otp) async {
    final response = await apiService.postData(
      endpoint: '/family-access/submit-code',
      data: {'otp': otp},
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Invalid code or request failed: ${response.body}');
    }
  }

  // TODO(backend): GET /family-access/members
  // Returns { members: [ { patientId, name, grantId } ] }
  Future<List<FamilyMember>> getAccessibleMembers() async {
    final response = await apiService.getData(
      endpoint: '/family-access/members',
    );
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['members'] as List<dynamic>? ?? [];
      return list
          .map((e) => FamilyMember.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to fetch family members: ${response.body}');
  }

  // TODO(backend): GET /family-access/pending
  // Returns { pending: [ { handshakeId, requesterId, requesterName, createdAt } ] }
  Future<List<PendingFamilyRequest>> getPendingFamilyRequests() async {
    final response = await apiService.getData(
      endpoint: '/family-access/pending',
    );
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['pending'] as List<dynamic>? ?? [];
      return list
          .map((e) => PendingFamilyRequest.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to fetch pending family requests: ${response.body}');
  }

  // TODO(backend): POST /family-access/respond  body: { handshakeId, approved }
  Future<void> respondToFamilyRequest({
    required String handshakeId,
    required bool approved,
  }) async {
    final response = await apiService.postData(
      endpoint: '/family-access/respond',
      data: {'handshakeId': handshakeId, 'approved': approved},
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Failed to respond to family request: ${response.body}');
    }
  }
}

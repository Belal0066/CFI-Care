import 'dart:convert';
import '../../data/services/datasources/api_service_booking.dart';
import '../models/grant_model.dart';

class AccessGrantRepository {
  final ApiService apiService;

  AccessGrantRepository(this.apiService);

  Future<OtpResponse> requestOtp() async {
    final response = await apiService.postData(
      endpoint: '/handshakes/request-otp',
      data: {},
    );
    if (response.statusCode == 200) {
      return OtpResponse.fromJson(json.decode(response.body));
    }
    throw Exception('Failed to generate OTP: ${response.body}');
  }

  Future<List<PendingGrant>> getPendingGrants() async {
    final response = await apiService.getData(endpoint: '/handshakes/pending');
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['pending'] as List<dynamic>? ?? [];
      return list.map((e) => PendingGrant.fromJson(e as Map<String, dynamic>)).toList();
    }
    throw Exception('Failed to fetch pending grants: ${response.body}');
  }

  Future<Grant?> respondToGrant({
    required String handshakeId,
    required bool approved,
    int durationMinutes = 60,
    List<String>? scopes,
  }) async {
    final response = await apiService.postData(
      endpoint: '/handshakes/grants',
      data: {
        'handshakeId': handshakeId,
        'approved': approved,
        if (approved) 'durationMinutes': durationMinutes,
        if (scopes != null && scopes.isNotEmpty) 'scopes': scopes,
      },
    );
    if (response.statusCode == 201 || response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      if (body['grant'] != null) return Grant.fromJson(body['grant'] as Map<String, dynamic>);
      return null;
    }
    throw Exception('Failed to respond to grant: ${response.body}');
  }

  Future<void> revokeGrant(String practitionerId) async {
    final response = await apiService.deleteData(
      endpoint: '/handshakes/grants/$practitionerId',
    );
    if (response.statusCode != 200) {
      throw Exception('Failed to revoke grant: ${response.body}');
    }
  }

  Future<List<Grant>> getActiveGrants() async {
    final response = await apiService.getData(endpoint: '/handshakes/grants');
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final list = body['grants'] as List<dynamic>? ?? [];
      return list.map((e) => Grant.fromJson(e as Map<String, dynamic>)).toList();
    }
    throw Exception('Failed to fetch active grants: ${response.body}');
  }

  Future<String?> fetchPractitionerName(String practitionerId) async {
    final response = await apiService.getData(endpoint: '/practitioners/$practitionerId');
    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      final name = body['name'] as String?;
      return (name != null && name.trim().isNotEmpty) ? name.trim() : null;
    }
    return null;
  }
}

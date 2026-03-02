import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:io';

import '../../../config/app_config.dart';

class ApiService {
  // 10.0.2.2 safely connects the Android Emulator to your local computer's port 3000 (Node.js HTTP)
  final String baseUrl = AppConfig.apiBaseUrl;

  final Future<String?> Function()? getAccessToken;
  final Future<String?> Function()? refreshToken;
  final Future<void> Function()? onUnauthorized;

  ApiService({this.getAccessToken, this.refreshToken, this.onUnauthorized});

  Future<Map<String, String>> _authHeaders({bool json = true}) async {
    final token = await getAccessToken?.call();
    // print('[AUTH HDR] token null=${token == null} empty=${(token ?? '').isEmpty} len=${token?.length ?? 0}');
    final headers = <String, String>{};
    if (json) headers['Content-Type'] = 'application/json';
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<http.Response> _authorizedRequest(
    Future<http.Response> Function(Map<String, String> headers) send,
  ) async {
    var headers = await _authHeaders();

    if (!headers.containsKey('Authorization')) {
      throw Exception('No access token available');
    }

    var response = await send(headers);

    if (response.statusCode == 401 && refreshToken != null) {
      try {
        final refreshed = await refreshToken!.call();
        if (refreshed != null && refreshed.isNotEmpty) {
          // headers = await _authHeaders();
          headers['Authorization'] = 'Bearer $refreshed';
          response = await send(headers);
        } else {
          await onUnauthorized?.call(); // refresh gave no token
        }
      } catch (e) {
         await onUnauthorized?.call();
      }
    }

    if (response.statusCode == 401) {
      await onUnauthorized?.call(); //still unauth after retry :<
    }

    // print('[AUTH REQ] status=${response.statusCode} authSent=${headers.containsKey('Authorization')}');
    return response;
  }

  Future<http.Response> postData({
    required String endpoint,
    required Map<String, dynamic> data,
  }) async {
    try {
      return _authorizedRequest((headers) {
        return http.post(
          Uri.parse('$baseUrl$endpoint'),
          headers: headers,
          body: json.encode(data),
        );
      });
    } catch (e) {
      throw Exception("Network Error during POST: $e");
    }
  }

  Future<Map<String, dynamic>> uploadDocument({
    required File file,
    required String title,
    required String type,
    required String specialty,
    required String date,
    required String patientId,
  }) async {
    // Note: Make sure this endpoint matches your backend route for document uploads
    // (e.g., /documentReferences based on your index.js)
    // var request = http.MultipartRequest(
    //   'POST',
    //   Uri.parse('$baseUrl/documents'),
    // );

    final token = await getAccessToken?.call();

    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/documents'),
    );
    if (token != null && token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }

    request.fields['title'] = title;
    request.fields['type'] = type;
    request.fields['specialty'] = specialty;
    request.fields['date'] = date;
    request.fields['patientId'] = patientId;

    request.files.add(await http.MultipartFile.fromPath('file', file.path));

    var streamedResponse = await request.send();
    var response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode == 401 && refreshToken != null) {
      final refreshed = await refreshToken!.call();
      if (refreshed != null && refreshed.isNotEmpty) {
        final retry = http.MultipartRequest(
          'POST',
          Uri.parse('$baseUrl/documents'),
        );
        retry.headers['Authorization'] = 'Bearer $refreshed';
        retry.fields.addAll(request.fields);
        retry.files.add(await http.MultipartFile.fromPath('file', file.path));
        streamedResponse = await retry.send();
        response = await http.Response.fromStream(streamedResponse);
      }
    }

    if (response.statusCode == 201 || response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception("Upload failed: ${response.body}");
    }
  }

  // --- 1. FETCH API (GET) ---
  Future<List<dynamic>> fetchDoctors({String? specialty}) async {
    try {
      final uri = specialty != null && specialty.isNotEmpty
          ? Uri.parse('$baseUrl/practitioners?specialtyDetail=$specialty')
          : Uri.parse('$baseUrl/practitioners');
      // final response = await http.get(uri);

      final response = await _authorizedRequest(
        (headers) => http.get(uri, headers: headers),
      );
      print('[fetchDoctors] status=${response.statusCode}');
      print('[fetchDoctors] body=${response.body}');

      if (response.statusCode == 200) {
        // Return raw JSON List (Repository will convert it)
        return json.decode(response.body);
      } else {
        throw Exception("Failed to load doctors: ${response.statusCode}");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }

  // Fetch available slots for a specific doctor
  Future<List<dynamic>> fetchSlotsForDoctor(String doctorId) async {
    try {
      final response = await _authorizedRequest((headers) {
        return http.get(
          Uri.parse('$baseUrl/slots/practitioner/$doctorId'),
          headers: headers,
        );
      });

      print('[fetchSlotsForDoctor] status=${response.statusCode}');
      print('[fetchSlotsForDoctor] body=${response.body}');

      if (response.statusCode == 200) {
        // Return raw JSON List
        return json.decode(response.body);
      } else {
        throw Exception("Failed to load slots: ${response.statusCode}");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }

  // --- 2. SEND API (POST) ---
  Future<void> createAppointment(Map<String, dynamic> bookingData) async {
    try {
      final response = await _authorizedRequest((headers) {
        return http.post(
          Uri.parse('$baseUrl/appointments'),
          headers: headers,
          body: json.encode(bookingData),
        );
      });

      if (response.statusCode != 201 && response.statusCode != 200) {
        throw Exception("Failed to create appointment");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }

  // Book an appointment with slot and practitioner details
  Future<Map<String, dynamic>> bookAppointment({
    required String patientId,
    required String practitionerId,
    required String slotId,
    required String start,
    required String end,
    required String appointmentType,
  }) async {
    try {
      final bookingData = {
        "patientId": patientId,
        "practitionerId": practitionerId,
        "slotId": slotId,
        "start": start,
        "end": end,
        "appointmentType": appointmentType,
      };

      final response = await _authorizedRequest((headers) {
        return http.post(
          Uri.parse('$baseUrl/appointments'),
          headers: headers,
          body: json.encode(bookingData),
        );
      });

      if (response.statusCode == 201 || response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception("Failed to book appointment: ${response.body}");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }
}

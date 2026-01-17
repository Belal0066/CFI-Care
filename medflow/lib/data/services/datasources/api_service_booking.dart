import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:io';
// import '../../../domain/models/doctors.dart';

class ApiService {
  // TODO: Replace with your actual API base URL
  final String baseUrl = "http://"; 

Future<Map<String, dynamic>> uploadDocument({
    required File file,
    required String title,
    required String type,
    required String specialty,
    required String date,
    required String patientId,
  }) async {
    var request = http.MultipartRequest('POST', Uri.parse('$baseUrl/documents'));

    request.fields['title'] = title;
    request.fields['type'] = type;
    request.fields['specialty'] = specialty;
    request.fields['date'] = date;
    request.fields['patientId'] = patientId;

    request.files.add(await http.MultipartFile.fromPath('file', file.path));

    var streamedResponse = await request.send();
    var response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode == 201 || response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception("Upload failed: ${response.body}");
    }
  }
  // --- 1. FETCH API (GET) ---
  Future<List<dynamic>> fetchDoctors() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/doctors'));

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

  // --- 2. SEND API (POST) ---
  Future<void> createAppointment(Map<String, dynamic> bookingData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/appointments'),
        headers: {"Content-Type": "application/json"},
        body: json.encode(bookingData),
      );

      if (response.statusCode != 201 && response.statusCode != 200) {
        throw Exception("Failed to create appointment");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }
}
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:io';

class ApiService {
  // 10.0.2.2 safely connects the Android Emulator to your local computer's port 3000 (Node.js HTTP)
  final String baseUrl = "http://10.0.2.2:3000/api";

  Future<http.Response> postData({
    required String endpoint,
    required Map<String, dynamic> data,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: {"Content-Type": "application/json"},
        body: json.encode(data),
      );
      return response;
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
    var request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/documents'),
    );

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
  Future<List<dynamic>> fetchDoctors({String? specialty}) async {
    try {
      final uri = specialty != null && specialty.isNotEmpty
          ? Uri.parse('$baseUrl/practitioners?specialtyDetail=$specialty')
          : Uri.parse('$baseUrl/practitioners');
      final response = await http.get(uri);

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
      final response = await http.get(
        Uri.parse('$baseUrl/slots/practitioner/$doctorId?status=free'),
      );

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

  // Fetch schedules with their associated slots for a specific doctor
  Future<List<dynamic>> fetchSchedulesWithSlots(String doctorId) async {
    try {
      final response = await http.get(
        Uri.parse(
          '$baseUrl/schedules/practitioner/$doctorId/with-slots?status=free',
        ),
      );

      print('[fetchSchedulesWithSlots] status=${response.statusCode}');
      print('[fetchSchedulesWithSlots] body=${response.body}');

      if (response.statusCode == 200) {
        // Return raw JSON List
        return json.decode(response.body);
      } else {
        throw Exception(
          "Failed to load schedules with slots: ${response.statusCode}",
        );
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }

  Future<Map<String, dynamic>> fetchAppointmentsByPatient(
    String patientId,
  ) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/appointments/patient/$patientId'),
      );

      if (response.statusCode == 200) {
        return json.decode(response.body) as Map<String, dynamic>;
      } else {
        throw Exception(
          "Failed to load appointments: ${response.statusCode} ${response.body}",
        );
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

      final response = await http.post(
        Uri.parse('$baseUrl/appointments'),
        headers: {"Content-Type": "application/json"},
        body: json.encode(bookingData),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception("Failed to book appointment: ${response.body}");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }

  Future<Map<String, dynamic>> cancelAppointment(String appointmentId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/appointments/$appointmentId'),
        headers: {"Content-Type": "application/json"},
        body: json.encode({"status": "cancelled"}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        throw Exception("Failed to cancel appointment: ${response.body}");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }
}

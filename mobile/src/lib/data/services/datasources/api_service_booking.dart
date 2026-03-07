import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:io';
import '../../../domain/models/document.dart';
import '../../../utils/enums/type_of_event.dart';
import '../../../utils/enums/speciality_event.dart';
import '../../mappers/document_fhir_mapper.dart';

class ApiService {
  // 10.0.2.2 safely connects the Android Emulator to your local computer's port 3000 (Node.js HTTP)
  // final String baseUrl = "http://10.0.2.2:3000/api";
  final String baseUrl = "http://192.168.1.37:3000/api";

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

  Future<http.Response> putData({
    required String endpoint,
    required Map<String, dynamic> data,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl$endpoint'),
        headers: {"Content-Type": "application/json"},
        body: json.encode(data),
      );
      return response;
    } catch (e) {
      throw Exception("Network Error during PUT: $e");
    }
  }

  TypeOfEventEnum _parseType(String type) {
    return TypeOfEventEnum.values.firstWhere(
      (e) => e.name.toLowerCase() == type.toLowerCase(),
      orElse: () => TypeOfEventEnum.other,
    );
  }

  SpecialityEventEnum _parseSpecialty(String specialty) {
    return SpecialityEventEnum.values.firstWhere(
      (e) => e.name.toLowerCase() == specialty.toLowerCase(),
      orElse: () => SpecialityEventEnum.other,
    );
  }

  bool _isPdf(String path) {
    return path.toLowerCase().endsWith('.pdf');
  }

  Future<Map<String, dynamic>> uploadDocument({
    required File file,
    required String title,
    required String type,
    required String specialty,
    required String date,
    required String patientId,
    String summary = '',
    String details = '',
  }) async {
    print(
      '[uploadDocument] start file=${file.path} patientId=$patientId type=$type specialty=$specialty',
    );
    final parsedDate = DateTime.tryParse(date) ?? DateTime.now();

    final tempDoc = DocumentModel(
      title: title,
      filePath: file.path,
      isPDF: _isPdf(file.path),
      summary: summary,
      details: details,
      type: _parseType(type),
      speciality: _parseSpecialty(specialty),
    );

    final fhirPayloads = await DocumentFhirMapper.toFhirR5Payloads(
      document: tempDoc,
      patientId: patientId,
      recordedAt: parsedDate,
      authorReference: 'Patient/$patientId',
    );

    final binaryResponse = await putData(
      endpoint: '/binary',
      data: fhirPayloads.binary,
    );

    print('[uploadDocument] /binary status=${binaryResponse.statusCode}');
    print('[uploadDocument] /binary body=${binaryResponse.body}');

    Map<String, dynamic> docRefPayload = fhirPayloads.documentReference;

    if (binaryResponse.statusCode == 413) {
      throw Exception(
        'Binary upload rejected: payload too large. Increase Node BODY_SIZE_LIMIT (e.g. 60mb) and retry.',
      );
    }

    if (binaryResponse.statusCode != 200 && binaryResponse.statusCode != 201) {
      print(
        '[uploadDocument] /binary failed, falling back to inline attachment.data',
      );
      final attachment =
          (docRefPayload['content'] as List).first['attachment']
              as Map<String, dynamic>;
      attachment.remove('url');
      attachment['data'] = fhirPayloads.binary['data'];
      attachment['size'] = await file.length();
    }

    final response = await postData(
      endpoint: '/documentReferences',
      data: docRefPayload,
    );

    print('[uploadDocument] /documentReferences status=${response.statusCode}');
    print('[uploadDocument] /documentReferences body=${response.body}');

    if (response.statusCode == 201 || response.statusCode == 200) {
      print('[uploadDocument] completed successfully');
      return json.decode(response.body);
    }

    throw Exception("Upload failed: ${response.body}");
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

  Future<Map<String, dynamic>> fetchDocumentReferencesByPatient(
    String patientId,
  ) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/documentReferences/patient/$patientId'),
      );

      print('[fetchDocumentReferencesByPatient] status=${response.statusCode}');
      print('[fetchDocumentReferencesByPatient] body=${response.body}');

      if (response.statusCode == 200) {
        return json.decode(response.body) as Map<String, dynamic>;
      } else {
        throw Exception(
          'Failed to fetch documents: ${response.statusCode} ${response.body}',
        );
      }
    } catch (e) {
      throw Exception('Network Error: $e');
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
    String? comment,
    String? symptomsText,
    List<String>? documentReferenceIds,
  }) async {
    try {
      final bookingData = {
        "patientId": patientId,
        "practitionerId": practitionerId,
        "slotId": slotId,
        "start": start,
        "end": end,
        "appointmentType": appointmentType,
        if (comment != null && comment.trim().isNotEmpty)
          "comment": comment.trim(),
        if (symptomsText != null && symptomsText.trim().isNotEmpty)
          "symptomsText": symptomsText.trim(),
        if (documentReferenceIds != null && documentReferenceIds.isNotEmpty)
          "documentReferenceIds": documentReferenceIds,
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

  Future<Map<String, dynamic>> updateAppointmentNotes({
    required String appointmentId,
    String? comment,
    String? symptomsText,
    List<String>? documentReferenceIds,
  }) async {
    try {
      final payload = <String, dynamic>{
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
        if (symptomsText != null && symptomsText.trim().isNotEmpty)
          'symptomsText': symptomsText.trim(),
        if (documentReferenceIds != null && documentReferenceIds.isNotEmpty)
          'documentReferenceIds': documentReferenceIds,
      };

      final response = await http.post(
        Uri.parse('$baseUrl/appointments/$appointmentId'),
        headers: {"Content-Type": "application/json"},
        body: json.encode(payload),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as Map<String, dynamic>;
      }

      throw Exception(
        'Failed to update appointment notes: ${response.statusCode} ${response.body}',
      );
    } catch (e) {
      throw Exception('Network Error: $e');
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

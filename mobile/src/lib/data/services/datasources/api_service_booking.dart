import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:io';
import '../../../domain/models/document.dart';
import '../../../utils/enums/type_of_event.dart';
import '../../../utils/enums/speciality_event.dart';
import '../../mappers/document_fhir_mapper.dart';

import '../../../config/app_config.dart';

class ApiService {
  // 10.0.2.2 safely connects the Android Emulator to your local computer's port 3000 (Node.js HTTP)
  final String baseUrl = AppConfig.apiBaseUrl;

  final Future<String?> Function()? getAccessToken;
  final Future<String?> Function()? refreshToken;
  final Future<void> Function()? onUnauthorized;

  ApiService({this.getAccessToken, this.refreshToken, this.onUnauthorized});

  bool _isSessionRevokedError(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('invalid_grant') ||
        text.contains('offline user session not found') ||
        text.contains('token_failed') ||
        text.contains('session expired');
  }

  Future<String?>? _refreshOngoing;

  Future<String?> _refreshTokenSemaphore() {
    final refresh = refreshToken;
    if (refresh == null) return Future.value(null);

    if (_refreshOngoing != null) return _refreshOngoing!;

    _refreshOngoing = refresh();
    _refreshOngoing!.whenComplete(() {
      _refreshOngoing = null;
    });

    return _refreshOngoing!;
  }
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

    // if (refreshToken != null) {
    //   try {
    //     final refreshed = await refreshToken!.call();
    //     if (refreshed != null && refreshed.isNotEmpty) {
    //       headers['Authorization'] = 'Bearer $refreshed';
    //     }
    //   } catch (e) {
    //     if (_isSessionRevokedError(e)) {
    //       await onUnauthorized?.call();
    //       throw Exception('Session expired, please sign in again');
    //     }
    //   }
    // }

    if (!headers.containsKey('Authorization')) {
      throw Exception('No access token available');
    }

    var response = await send(headers);

    var shouldForceLogout = false;

    if (response.statusCode == 401 && refreshToken != null) {
      try {
        // final refreshed = await refreshToken!.call();
        final refreshed = await _refreshTokenSemaphore();
        if (refreshed != null && refreshed.isNotEmpty) {
          // headers = await _authHeaders();
          headers['Authorization'] = 'Bearer $refreshed';
          response = await send(headers);
        } else {
          // await onUnauthorized?.call(); // refresh gave no token
          shouldForceLogout = true;
        }
      } catch (e) {
        // await onUnauthorized?.call();
        if (_isSessionRevokedError(e)) {
          shouldForceLogout = true;
        } else {
          rethrow;
        }
      }
    }

    if (response.statusCode == 401 && shouldForceLogout) {
      await onUnauthorized?.call(); //still unauth after retry :<
    }

    // print('[AUTH REQ] status=${response.statusCode} authSent=${headers.containsKey('Authorization')}');
    return response;
  }

  Future<http.Response> getData({required String endpoint}) async {
    try {
      return _authorizedRequest((headers) {
        return http.get(Uri.parse('$baseUrl$endpoint'), headers: headers);
      });
    } catch (e) {
      throw Exception("Network Error during GET: $e");
    }
  }

  Future<http.Response> deleteData({required String endpoint}) async {
    try {
      return _authorizedRequest((headers) {
        return http.delete(Uri.parse('$baseUrl$endpoint'), headers: headers);
      });
    } catch (e) {
      throw Exception("Network Error during DELETE: $e");
    }
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

  Future<http.Response> putData({
    required String endpoint,
    required Map<String, dynamic> data,
  }) async {
    try {
      return _authorizedRequest((headers) {
        return http.put(
          Uri.parse('$baseUrl$endpoint'),
          headers: headers,
          body: json.encode(data),
        );
      });
    } catch (e) {
      throw Exception("Network Error during PUT: $e");
    }
  }

  Future<http.Response> uploadBinaryMultipart({
    required File file,
    required String binaryId,
    required String documentReferenceId,
    required String patientId,
    required String contentType,
  }) async {
    final request = http.MultipartRequest('PUT', Uri.parse('$baseUrl/binary'));
    final token = await getAccessToken?.call();
    if (token != null && token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }

    request.fields['id'] = binaryId;
    request.fields['documentReferenceId'] = documentReferenceId;
    request.fields['patientId'] = patientId;
    request.fields['contentType'] = contentType;
    request.files.add(
      await http.MultipartFile.fromPath(
        'pdf',
        file.path,
        filename: file.uri.pathSegments.isNotEmpty
            ? file.uri.pathSegments.last
            : 'document.pdf',
      ),
    );

    final streamed = await request.send();
    return http.Response.fromStream(streamed);
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
    if (token != null && token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }

    final fhirPayloads = await DocumentFhirMapper.toFhirR5Payloads(
      document: tempDoc,
      patientId: patientId,
      recordedAt: parsedDate,
      authorReference: 'Patient/$patientId',
    );

    final binaryResponse = await uploadBinaryMultipart(
      file: file,
      binaryId: fhirPayloads.binaryId,
      documentReferenceId: fhirPayloads.documentReferenceId,
      patientId: patientId,
      contentType:
          (fhirPayloads.binary['contentType'] as String?) ?? 'application/pdf',
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
      throw Exception('Binary upload failed: ${binaryResponse.body}');
    }

    var response = await putData(
      endpoint: '/documentReferences',
      data: docRefPayload,
    );

    print('[uploadDocument] /documentReferences status=${response.statusCode}');
    print('[uploadDocument] /documentReferences body=${response.body}');

    // if (response.statusCode == 401 && refreshToken != null) {
    //   final refreshed = await refreshToken!.call();
    //   if (refreshed != null && refreshed.isNotEmpty) {
    //     final retry = http.MultipartRequest(
    //       'POST',
    //       Uri.parse('$baseUrl/documents'),
    //     );
    //     retry.headers['Authorization'] = 'Bearer $refreshed';
    //     retry.fields.addAll(request.fields);
    //     retry.files.add(await http.MultipartFile.fromPath('file', file.path));
    //     final streamedResponse = await retry.send();
    //     response = await http.Response.fromStream(streamedResponse);
    //   }
    // }

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

  // Fetch schedules with their associated slots for a specific doctor
  Future<List<dynamic>> fetchSchedulesWithSlots(String doctorId) async {
    try {
      final response = await _authorizedRequest((headers) {
        return http.get(
          Uri.parse(
            '$baseUrl/schedules/practitioner/$doctorId/with-slots?status=free',
          ),
          headers: headers,
        );
      });

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
      final response = await _authorizedRequest((headers) {
        return http.get(
          Uri.parse('$baseUrl/appointments/patient/$patientId'),
          headers: headers,
        );
      });

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
      final response = await _authorizedRequest((headers) {
        return http.get(
          Uri.parse('$baseUrl/documentReferences/patient/$patientId'),
          headers: headers,
        );
      });

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

      final response = await _authorizedRequest((headers) {
        return http.post(
          Uri.parse('$baseUrl/appointments/$appointmentId'),
          headers: headers,
          body: json.encode(payload),
        );
      });

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
      final response = await _authorizedRequest((headers) {
        return http.post(
          Uri.parse('$baseUrl/appointments/$appointmentId'),
          headers: headers,
          body: json.encode({"status": "cancelled"}),
        );
      });

      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        throw Exception("Failed to cancel appointment: ${response.body}");
      }
    } catch (e) {
      throw Exception("Network Error: $e");
    }
  }

  // Returns List<FHIR EpisodeOfCare> for the given patient.
  // Backend: GET /api/episodeOfCare/patient/{patientId}
  Future<List<dynamic>> fetchEpisodesOfCare(String patientId) async {
    try {
      final response = await _authorizedRequest((headers) {
        return http.get(
          Uri.parse('$baseUrl/episodeOfCare/patient/$patientId'),
          headers: headers,
        );
      });

      print('[fetchEpisodesOfCare] status=${response.statusCode}');

      if (response.statusCode == 200) {
        final decoded = json.decode(response.body);
        // Backend returns a plain array of FHIR resources.
        if (decoded is List) return decoded;
        // Defensive: FHIR bundle wrapper
        if (decoded is Map && decoded['entry'] != null) {
          return (decoded['entry'] as List).map((e) => e['resource']).toList();
        }
        return [];
      } else {
        throw Exception('Failed to fetch episodes: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network Error: $e');
    }
  }

  // Returns the nodes list for a patient's episode from the history graph.
  // Backend: GET /api/historyGraph/{patientId}?eocId={eocId}
  // Response shape: { nodes: [...], eocId, pagination }
  Future<List<dynamic>> fetchGraphNodesForEpisode(
    String patientId,
    String eocId,
  ) async {
    try {
      final uri = Uri.parse('$baseUrl/historyGraph/$patientId').replace(
        queryParameters: {'eocId': eocId},
      );

      final response = await _authorizedRequest(
        (headers) => http.get(uri, headers: headers),
      );

      print('[fetchGraphNodesForEpisode] status=${response.statusCode}');

      if (response.statusCode == 200) {
        final decoded = json.decode(response.body) as Map<String, dynamic>;
        return (decoded['nodes'] as List<dynamic>?) ?? [];
      } else {
        throw Exception('Failed to fetch graph nodes: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network Error: $e');
    }
  }
}

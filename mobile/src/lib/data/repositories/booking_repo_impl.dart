import '../../domain/models/doctors.dart';
import '../../domain/models/appointment_history.dart';
import '../services/datasources/api_service_booking.dart';

class BookingRepositoryImpl {
  final ApiService apiService;

  BookingRepositoryImpl(this.apiService);

  // --- GET DOCTORS ---
  Future<List<Doctor>> getDoctors({String? specialty}) async {
    final rawData = await apiService.fetchDoctors(specialty: specialty);

    // Map the raw JSON to your Doctor model
    return rawData
        .map((json) => Doctor.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<bool> createBooking(AppointmentHistory appointment) async {
    try {
      // This calls your API service (e.g., http.post)
      // We pass the JSON we just created
      final response = await apiService.postData(
        //TODO: change the endpoint to the correct one
        endpoint: '/appointments',
        data: appointment.toJson(),
      );

      // Return true if status code is 200/201
      return response.statusCode == 200 || response.statusCode == 201;
    } catch (e) {
      print("Error sending booking to server: $e");
      return false;
    }
  }
  // --- SUBMIT BOOKING ---
  Future<void> submitBooking({
    required Doctor doctor,
    required DateTime date,
    required String time,
    required String patientName,
    required String patientPhone,
  }) async {
    // 1. Prepare Data for Node.js
    final bookingJson = {
      "doctorId": doctor.id,
      "date": date.toIso8601String(), // Sends "2026-01-17T..."
      "time": time,
      "patientName": patientName,
      "patientPhone": patientPhone,
    };

    // 2. Send it
    await apiService.createAppointment(bookingJson);
  }
}

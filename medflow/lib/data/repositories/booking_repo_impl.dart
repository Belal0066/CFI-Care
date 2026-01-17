import '../../domain/models/doctors.dart';
// import '../../domain/models/appointments.dart';
import '../services/datasources/api_service_booking.dart';

class BookingRepositoryImpl {
  final ApiService apiService;

  BookingRepositoryImpl(this.apiService);

  // --- GET DOCTORS ---
  Future<List<Doctor>> getDoctors() async {
    final rawData = await apiService.fetchDoctors();

    // Map the raw JSON to your Doctor model
    return rawData.map((json) {
      // Create Doctor object from JSON
      return Doctor(
        id: json['id'].toString(),
        name: json['name'],
        title: json['specialty'], 
        imageUrl: json['image_url'] ?? 'assets/images/default_doc.png',
        fees: json['fees'] ?? 0,
        address: json['address'] ?? "Unknown",
        rating: (json['rating'] ?? 0).toDouble(),
        // Note: You might need to parse the schedule array here too
        schedule: [], // Use your date_helper here or parse from JSON
        reviews: [],
        waitingTime: 0, 
        visitorCount: 0, 
        specialtyDetail: "", 
        tags: [], 
        nextAvailable: ""
      );
    }).toList();
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
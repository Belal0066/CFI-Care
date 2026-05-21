import '../../domain/models/doctors.dart';
import '../../domain/models/appointment_history.dart';
import '../services/datasources/api_service_booking.dart';

class DoctorSlot {
  final String id;
  final String startTime;
  final String endTime;
  final String date;
  final String rawDate;
  final String rawStart; // Raw ISO start datetime
  final String rawEnd; // Raw ISO end datetime
  final String status;

  DoctorSlot({
    required this.id,
    required this.startTime,
    required this.endTime,
    required this.date,
    required this.rawDate,
    required this.rawStart,
    required this.rawEnd,
    required this.status,
  });
}

class DaySlots {
  final String date; // Formatted date (e.g., "Feb 16, 2026")
  final String rawDate; // Raw date for filtering (e.g., "2026-02-16")
  final String firstSlotTime; // First available slot time
  final String lastSlotTime; // Last available slot time
  final List<DoctorSlot> slots; // All slots for this day

  DaySlots({
    required this.date,
    required this.rawDate,
    required this.firstSlotTime,
    required this.lastSlotTime,
    required this.slots,
  });
}

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

  // --- GET DOCTOR SLOTS ---
  Future<List<DoctorSlot>> getDoctorSlots(String doctorId) async {
    try {
      final rawSlots = await apiService.fetchSlotsForDoctor(doctorId);

      // Map raw ISO dates to readable time strings
      return rawSlots.map((slotData) {
        final slot = slotData as Map<String, dynamic>;
        // Parse UTC time and convert to local timezone
        final startDateTime = DateTime.parse(slot['start'] as String).toLocal();
        final endDateTime = DateTime.parse(slot['end'] as String).toLocal();

        final startTime = _formatTime(startDateTime);
        final endTime = _formatTime(endDateTime);
        final date = _formatDate(startDateTime);
        final rawDate = _formatRawDate(startDateTime);

        return DoctorSlot(
          id: slot['id'] as String,
          startTime: startTime,
          endTime: endTime,
          date: date,
          rawDate: rawDate,
          rawStart: slot['start'] as String,
          rawEnd: slot['end'] as String,
          status: slot['status'] as String,
        );
      }).toList();
    } catch (e) {
      print("Error fetching doctor slots: $e");
      throw Exception("Failed to fetch slots for doctor: $e");
    }
  }

  // Helper function to format ISO datetime to readable time string
  String _formatTime(DateTime dateTime) {
    final hour = dateTime.hour;
    final minute = dateTime.minute;
    final ampm = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour);
    final minuteStr = minute.toString().padLeft(2, '0');
    return '$displayHour:$minuteStr $ampm';
  }

  // Helper function to format date as "Month Day, Year"
  String _formatDate(DateTime dateTime) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[dateTime.month - 1]} ${dateTime.day}, ${dateTime.year}';
  }

  // Helper function to format raw date as "YYYY-MM-DD"
  String _formatRawDate(DateTime dateTime) {
    final year = dateTime.year;
    final month = dateTime.month.toString().padLeft(2, '0');
    final day = dateTime.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
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

  // --- BOOK APPOINTMENT WITH SLOT ---
  Future<Map<String, dynamic>> bookAppointmentWithSlot({
    required String patientId,
    required String practitionerId,
    required String slotId,
    required String start,
    required String end,
    required String appointmentType,
  }) async {
    try {
      final result = await apiService.bookAppointment(
        patientId: patientId,
        practitionerId: practitionerId,
        slotId: slotId,
        start: start,
        end: end,
        appointmentType: appointmentType,
      );
      return result;
    } catch (e) {
      print("Error booking appointment: $e");
      throw Exception("Failed to book appointment: $e");
    }
  }
}

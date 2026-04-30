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
  final String scheduleReference; // Schedule reference (e.g., "Schedule/2157")

  DoctorSlot({
    required this.id,
    required this.startTime,
    required this.endTime,
    required this.date,
    required this.rawDate,
    required this.rawStart,
    required this.rawEnd,
    required this.status,
    required this.scheduleReference,
  });
}

class DoctorSchedule {
  final String id;
  final String startDateTime; // Formatted start date/time
  final String endDateTime; // Formatted end date/time
  final String rawStart; // Raw ISO start
  final String rawEnd; // Raw ISO end
  final bool active;

  DoctorSchedule({
    required this.id,
    required this.startDateTime,
    required this.endDateTime,
    required this.rawStart,
    required this.rawEnd,
    required this.active,
  });
}

class ScheduleWithSlots {
  final DoctorSchedule schedule;
  final List<DoctorSlot> slots;

  ScheduleWithSlots({required this.schedule, required this.slots});
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
          scheduleReference: slot['schedule']?['reference'] as String? ?? '',
        );
      }).toList();
    } catch (e) {
      print("Error fetching doctor slots: $e");
      throw Exception("Failed to fetch slots for doctor: $e");
    }
  }

  // --- GET SCHEDULES WITH SLOTS ---
  Future<List<ScheduleWithSlots>> getSchedulesWithSlots(String doctorId) async {
    try {
      final rawData = await apiService.fetchSchedulesWithSlots(doctorId);

      return rawData.map((item) {
        final scheduleData = item['schedule'] as Map<String, dynamic>;
        final slotsData = item['slots'] as List<dynamic>;

        // Parse schedule planning horizon for start/end times
        final planningHorizon =
            scheduleData['planningHorizon'] as Map<String, dynamic>?;
        final rawStart = planningHorizon?['start'] as String? ?? '';
        final rawEnd = planningHorizon?['end'] as String? ?? '';

        DateTime? startDt;
        DateTime? endDt;
        if (rawStart.isNotEmpty) {
          startDt = DateTime.parse(rawStart).toLocal();
        }
        if (rawEnd.isNotEmpty) {
          endDt = DateTime.parse(rawEnd).toLocal();
        }

        final schedule = DoctorSchedule(
          id: scheduleData['id'] as String,
          startDateTime: startDt != null ? _formatDateTime(startDt) : '',
          endDateTime: endDt != null ? _formatDateTime(endDt) : '',
          rawStart: rawStart,
          rawEnd: rawEnd,
          active: scheduleData['active'] as bool? ?? true,
        );

        // Parse slots
        final slots = slotsData.map((slotData) {
          final slot = slotData as Map<String, dynamic>;
          final startDateTime = DateTime.parse(
            slot['start'] as String,
          ).toLocal();
          final endDateTime = DateTime.parse(slot['end'] as String).toLocal();

          return DoctorSlot(
            id: slot['id'] as String,
            startTime: _formatTime(startDateTime),
            endTime: _formatTime(endDateTime),
            date: _formatDate(startDateTime),
            rawDate: _formatRawDate(startDateTime),
            rawStart: slot['start'] as String,
            rawEnd: slot['end'] as String,
            status: slot['status'] as String,
            scheduleReference:
                slot['scheduleReference'] as String? ??
                'Schedule/${schedule.id}',
          );
        }).toList();

        return ScheduleWithSlots(schedule: schedule, slots: slots);
      }).toList();
    } catch (e) {
      print("Error fetching schedules with slots: $e");
      throw Exception("Failed to fetch schedules with slots: $e");
    }
  }

  Future<List<AppointmentHistory>> getAppointmentsByPatient(
    String patientId,
  ) async {
    try {
      final bundle = await apiService.fetchAppointmentsByPatient(patientId);
      final entries = (bundle['entry'] as List<dynamic>?) ?? [];
      final practitioners = await getDoctors();
      final practitionersById = <String, Doctor>{
        for (final doctor in practitioners) doctor.id: doctor,
      };

      return entries.map((entry) {
        final resource = entry['resource'] as Map<String, dynamic>;

        final participants =
            (resource['participant'] as List<dynamic>? ?? const []);

        String practitionerId = '';
        for (final participant in participants) {
          final actor = participant['actor'] as Map<String, dynamic>?;
          final reference = actor?['reference']?.toString() ?? '';
          if (reference.startsWith('Practitioner/')) {
            practitionerId = reference.split('/').last;
            break;
          }
        }

        final startRaw = resource['start']?.toString() ?? '';
        DateTime? startDateTime;
        if (startRaw.isNotEmpty) {
          startDateTime = DateTime.tryParse(startRaw)?.toLocal();
        }

        final dateText = startDateTime != null
            ? _formatDate(startDateTime)
            : 'Unknown Date';

        final timeText = startDateTime != null
            ? _formatTime(startDateTime)
            : 'Unknown Time';

        final statusText = (resource['status']?.toString() ?? '').toLowerCase();
        final status = statusText == 'cancelled'
            ? AppointmentStatus.canceled
            : AppointmentStatus.upcoming;

        final fallbackDoctor = Doctor(
          id: practitionerId,
          name: practitionerId.isNotEmpty ? practitionerId : 'Unknown Doctor',
          title: 'General Practitioner',
          imageUrl: '',
          rating: 0,
          visitorCount: 0,
          specialtyDetail: 'General Medicine',
          address: 'Unknown address',
          fees: 0,
          waitingTime: 0,
          nextAvailable: '',
          schedule: [],
          reviews: [],
        );

        final doctor = practitionersById[practitionerId] ?? fallbackDoctor;

        return AppointmentHistory(
          id: resource['id']?.toString() ?? '',
          doctor: doctor,
          date: dateText,
          time: timeText,
          status: status,
        );
      }).toList();
    } catch (e) {
      print('Error fetching appointments by patient: $e');
      throw Exception('Failed to fetch appointments for patient: $e');
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

  // Helper function to format full datetime as "Month Day, Year HH:MM AM/PM"
  String _formatDateTime(DateTime dateTime) {
    final dateStr = _formatDate(dateTime);
    final timeStr = _formatTime(dateTime);
    return '$dateStr $timeStr';
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
    String? comment,
    String? symptomsText,
    List<String>? documentReferenceIds,
  }) async {
    try {
      final result = await apiService.bookAppointment(
        patientId: patientId,
        practitionerId: practitionerId,
        slotId: slotId,
        start: start,
        end: end,
        appointmentType: appointmentType,
        comment: comment,
        symptomsText: symptomsText,
        documentReferenceIds: documentReferenceIds,
      );
      return result;
    } catch (e) {
      print("Error booking appointment: $e");
      throw Exception("Failed to book appointment: $e");
    }
  }

  Future<Map<String, dynamic>> updateAppointmentNotes({
    required String appointmentId,
    String? comment,
    String? symptomsText,
    List<String>? documentReferenceIds,
  }) async {
    try {
      return await apiService.updateAppointmentNotes(
        appointmentId: appointmentId,
        comment: comment,
        symptomsText: symptomsText,
        documentReferenceIds: documentReferenceIds,
      );
    } catch (e) {
      print("Error updating appointment notes: $e");
      throw Exception("Failed to update appointment notes: $e");
    }
  }

  Future<Map<String, dynamic>> cancelAppointment(String appointmentId) async {
    try {
      final result = await apiService.cancelAppointment(appointmentId);
      return result;
    } catch (e) {
      print("Error cancelling appointment: $e");
      throw Exception("Failed to cancel appointment: $e");
    }
  }
}

import 'doctors.dart';

enum AppointmentStatus { upcoming, completed, canceled }

class AppointmentHistory {
  final String id;
  final Doctor doctor;
  final String date;
  final String time;
  AppointmentStatus status;

  AppointmentHistory({
    required this.id,
    required this.doctor,
    required this.date,
    required this.time,
    this.status = AppointmentStatus.upcoming,
  });

  // --- Convert to JSON for API ---
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'doctor_id': doctor.id, 
      'date': date,
      'time': time,
      'status': status.name,
    };
  }
}
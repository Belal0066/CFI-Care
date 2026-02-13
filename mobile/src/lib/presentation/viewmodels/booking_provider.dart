import 'package:flutter/material.dart';
import '../../domain/models/doctors.dart';
import '../../utils/enums/speciality_event.dart';
import '../../data/repositories/booking_repo_impl.dart';
import '../../domain/models/appointment_history.dart';

class BookingProvider with ChangeNotifier {
  final BookingRepositoryImpl repository;

  BookingProvider(this.repository);
  // --- PRIVATE VARIABLES (The State) ---
  // We make them nullable (?) because at the start, nothing is selected.
  SpecialityEventEnum? _selectedSpecialty;
  Doctor? _selectedDoctor;
  DateTime? _selectedDate;
  String? _selectedTime;
  final List<AppointmentHistory> _appointments = [];
  List<Doctor> _doctors = [];
  bool _isLoadingDoctors = false;
  String? _doctorsError;

  // --- GETTERS (How UI reads data) ---
  SpecialityEventEnum? get selectedSpecialty => _selectedSpecialty;
  Doctor? get selectedDoctor => _selectedDoctor;
  DateTime? get selectedDate => _selectedDate;
  String? get selectedTime => _selectedTime;
  List<AppointmentHistory> get appointments => _appointments;
  List<Doctor> get doctors => _doctors;
  bool get isLoadingDoctors => _isLoadingDoctors;
  String? get doctorsError => _doctorsError;

  // Helper: Get formatted date string for UI (e.g., "Mon 19/1/25")
  String get formattedDate {
    if (_selectedDate == null) return "No Date Selected";
    return "${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}";
  }

  // --- SETTERS (How UI updates data) ---

  // Select Specialty
  void setSpecialty(SpecialityEventEnum specialty) {
    _selectedSpecialty = specialty;
    notifyListeners(); // Updates any widget listening to this
  }

  // Select Doctor
  void selectDoctor(Doctor doctor) {
    _selectedDoctor = doctor;
    // When changing doctor, we usually want to reset the time slot
    _selectedDate = null;
    _selectedTime = null;
    notifyListeners();
  }

  // Select Time Slot
  void setTimeSlot(DateTime date, String time) {
    _selectedDate = date;
    _selectedTime = time;
    notifyListeners();
  }

  Future<void> loadDoctors({String? specialty}) async {
    if (_isLoadingDoctors) return;
    _isLoadingDoctors = true;
    _doctorsError = null;
    notifyListeners();

    try {
      _doctors = await repository.getDoctors(specialty: specialty);
    } catch (e) {
      _doctorsError = e.toString();
      _doctors = [];
    } finally {
      _isLoadingDoctors = false;
      notifyListeners();
    }
  }

  // --- Confirm Booking ---
  Future<void> confirmBooking() async {
    if (_selectedDoctor != null && _selectedTime != null) {
      final newAppointment = AppointmentHistory(
        id: DateTime.now().millisecondsSinceEpoch.toString(), // Unique ID
        doctor: _selectedDoctor!,
        date: formattedDate,
        time: _selectedTime!,
        status: AppointmentStatus.upcoming,
      );

      // A. OPTIMISTIC UPDATE (Show Card Immediately)
      _appointments.add(newAppointment);
      notifyListeners();

      // B. SEND TO SERVER
      final success = await repository.createBooking(newAppointment);

      if (!success) {
        // Option: If server fails, remove the card or show error
        // _appointments.remove(newAppointment);
        // notifyListeners();
        print("Failed to sync booking to server");
      }
    }
  }

  // --- Cancel Appointment ---
  void cancelAppointment(String id) {
    final index = _appointments.indexWhere((app) => app.id == id);
    if (index != -1) {
      _appointments[index].status = AppointmentStatus.canceled;
      notifyListeners();
    }
  }
  // --- LOGIC & CLEANUP ---

  // Check if booking is complete
  bool get isBookingComplete {
    return _selectedSpecialty != null &&
        _selectedDoctor != null &&
        _selectedDate != null &&
        _selectedTime != null;
  }

  // Reset Everything (Call this after "Thank You" screen)
  void clearBookingData() {
    _selectedSpecialty = null;
    _selectedDoctor = null;
    _selectedDate = null;
    _selectedTime = null;
    notifyListeners();
  }
}

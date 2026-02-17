import 'package:flutter/material.dart';
import '../../domain/models/doctors.dart';
import '../../utils/enums/speciality_event.dart';
import '../../data/repositories/booking_repo_impl.dart';
import '../../domain/models/appointment_history.dart';
import '../../database/db_helper.dart';

class BookingProvider with ChangeNotifier {
  final BookingRepositoryImpl repository;

  BookingProvider(this.repository);
  // --- PRIVATE VARIABLES (The State) ---
  // We make them nullable (?) because at the start, nothing is selected.
  SpecialityEventEnum? _selectedSpecialty;
  Doctor? _selectedDoctor;
  DateTime? _selectedDate;
  String? _selectedTime;
  DoctorSlot? _selectedSlot;
  final List<AppointmentHistory> _appointments = [];
  List<Doctor> _doctors = [];
  bool _isLoadingDoctors = false;
  String? _doctorsError;

  // Slots state
  List<DoctorSlot> _availableSlots = [];
  bool _isLoadingSlots = false;
  String? _slotsError;
  String? _selectedDayDate; // Store the selected day's raw date for filtering

  // --- GETTERS (How UI reads data) ---
  SpecialityEventEnum? get selectedSpecialty => _selectedSpecialty;
  Doctor? get selectedDoctor => _selectedDoctor;
  DateTime? get selectedDate => _selectedDate;
  String? get selectedTime => _selectedTime;
  DoctorSlot? get selectedSlot => _selectedSlot;
  List<AppointmentHistory> get appointments => _appointments;
  List<Doctor> get doctors => _doctors;
  bool get isLoadingDoctors => _isLoadingDoctors;
  String? get doctorsError => _doctorsError;
  List<DoctorSlot> get availableSlots => _availableSlots;
  bool get isLoadingSlots => _isLoadingSlots;
  String? get slotsError => _slotsError;

  // Group slots by day and return list of DaySlots
  List<DaySlots> get slotsByDay {
    if (_availableSlots.isEmpty) return [];

    // Group slots by rawDate
    final Map<String, List<DoctorSlot>> groupedSlots = {};
    for (final slot in _availableSlots) {
      if (!groupedSlots.containsKey(slot.rawDate)) {
        groupedSlots[slot.rawDate] = [];
      }
      groupedSlots[slot.rawDate]!.add(slot);
    }

    // Convert to DaySlots list
    return groupedSlots.entries.map((entry) {
      final slots = entry.value;
      return DaySlots(
        date: slots.first.date, // Formatted date
        rawDate: entry.key,
        firstSlotTime: slots.first.startTime,
        lastSlotTime: slots.last.endTime,
        slots: slots,
      );
    }).toList();
  }

  // Get slots for a specific day
  List<DoctorSlot> getSlotsForDay(String rawDate) {
    return _availableSlots.where((slot) => slot.rawDate == rawDate).toList();
  }

  // Select a specific day
  void selectDay(String rawDate) {
    _selectedDayDate = rawDate;
    notifyListeners();
  }

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

  // Select a specific slot
  void selectSlot(DoctorSlot slot) {
    _selectedSlot = slot;
    _selectedDate = DateTime.parse(slot.rawDate);
    _selectedTime = "${slot.startTime} - ${slot.endTime}";
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

  // Load available slots for a specific doctor
  Future<void> loadDoctorSlots(String doctorId) async {
    if (_isLoadingSlots) return;
    _isLoadingSlots = true;
    _slotsError = null;
    _availableSlots = [];
    notifyListeners();

    try {
      print('[BookingProvider] Loading slots for doctor: $doctorId');
      _availableSlots = await repository.getDoctorSlots(doctorId);
      print('[BookingProvider] Loaded ${_availableSlots.length} slots');
    } catch (e) {
      print('[BookingProvider] Error loading slots: $e');
      _slotsError = e.toString();
      _availableSlots = [];
    } finally {
      _isLoadingSlots = false;
      notifyListeners();
    }
  }

  // --- Confirm Booking ---
  Future<void> confirmBooking() async {
    if (_selectedDoctor == null || _selectedSlot == null) {
      print("Missing doctor or slot selection");
      return;
    }

    final patientId = Session.currentUserId;
    if (patientId == null) {
      print("Missing patient ID in session");
      return;
    }

    final newAppointment = AppointmentHistory(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      doctor: _selectedDoctor!,
      date: formattedDate,
      time: _selectedTime ?? "",
      status: AppointmentStatus.upcoming,
    );

    // A. OPTIMISTIC UPDATE (Show Card Immediately)
    _appointments.add(newAppointment);
    notifyListeners();

    // B. SEND TO SERVER (FHIR appointment + slot update)
    try {
      await repository.bookAppointmentWithSlot(
        patientId: patientId,
        practitionerId: _selectedDoctor!.id,
        slotId: _selectedSlot!.id,
        start: _selectedSlot!.rawStart,
        end: _selectedSlot!.rawEnd,
        appointmentType: "general",
      );
    } catch (e) {
      print("Failed to sync booking to server: $e");
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
    _selectedSlot = null;
    notifyListeners();
  }
}

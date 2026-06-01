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
  String? _lastBookedAppointmentId;
  final List<AppointmentHistory> _appointments = [];
  List<Doctor> _doctors = [];
  bool _isLoadingDoctors = false;
  String? _doctorsError;

  // Slots state
  List<DoctorSlot> _availableSlots = [];
  bool _isLoadingSlots = false;
  String? _slotsError;
  String? _selectedDayDate; // Store the selected day's raw date for filtering

  // Schedules with slots state
  List<ScheduleWithSlots> _schedulesWithSlots = [];
  bool _isLoadingSchedules = false;
  String? _schedulesError;

  // --- GETTERS (How UI reads data) ---
  SpecialityEventEnum? get selectedSpecialty => _selectedSpecialty;
  Doctor? get selectedDoctor => _selectedDoctor;
  DateTime? get selectedDate => _selectedDate;
  String? get selectedTime => _selectedTime;
  DoctorSlot? get selectedSlot => _selectedSlot;
  String? get lastBookedAppointmentId => _lastBookedAppointmentId;
  List<AppointmentHistory> get appointments => _appointments;
  List<Doctor> get doctors => _doctors;
  bool get isLoadingDoctors => _isLoadingDoctors;
  String? get doctorsError => _doctorsError;
  List<DoctorSlot> get availableSlots => _availableSlots;
  bool get isLoadingSlots => _isLoadingSlots;
  String? get slotsError => _slotsError;

  // Schedules with slots getters
  List<ScheduleWithSlots> get schedulesWithSlots => _schedulesWithSlots;
  bool get isLoadingSchedules => _isLoadingSchedules;
  String? get schedulesError => _schedulesError;

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
    print("PROVIDER HASH: ${this.hashCode}");
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

  Future<void> loadAppointmentsForCurrentUser() async {
    final patientId = Session.fhirPatientId ?? Session.currentUserId;
    if (patientId == null || patientId.isEmpty) {
      return;
    }

    try {
      final serverAppointments = await repository.getAppointmentsByPatient(
        patientId,
      );

      // Keep local upcoming appointments that may not be searchable yet on backend
      final localUpcomingById = <String, AppointmentHistory>{
        for (final appointment in _appointments)
          if (appointment.status != AppointmentStatus.canceled)
            appointment.id: appointment,
      };

      final serverById = <String, AppointmentHistory>{
        for (final appointment in serverAppointments)
          if (appointment.status != AppointmentStatus.canceled)
            appointment.id: appointment,
      };

      // Merge: server data wins, but keep local optimistic items missing from server
      final merged = <AppointmentHistory>[
        ...serverById.values,
        ...localUpcomingById.entries
            .where((entry) => !serverById.containsKey(entry.key))
            .map((entry) => entry.value),
      ];

      _appointments
        ..clear()
        ..addAll(merged);
      notifyListeners();
    } catch (e) {
      print('[BookingProvider] Error loading appointments: $e');
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

  // Load schedules with slots for a specific doctor
  Future<void> loadDoctorSchedulesWithSlots(String doctorId) async {
    if (_isLoadingSchedules) return;
    _isLoadingSchedules = true;
    _schedulesError = null;
    _schedulesWithSlots = [];
    notifyListeners();

    try {
      print(
        '[BookingProvider] Loading schedules with slots for doctor: $doctorId',
      );
      _schedulesWithSlots = await repository.getSchedulesWithSlots(doctorId);
      print('[BookingProvider] Loaded ${_schedulesWithSlots.length} schedules');
    } catch (e) {
      print('[BookingProvider] Error loading schedules with slots: $e');
      _schedulesError = e.toString();
      _schedulesWithSlots = [];
    } finally {
      _isLoadingSchedules = false;
      notifyListeners();
    }
  }

  // --- Confirm Booking ---
  Future<bool> confirmBooking() async {
    final selectedDoctor = _selectedDoctor;
    final selectedSlot = _selectedSlot;
    final selectedDate = _selectedDate;
    final selectedTime = _selectedTime;

    if (selectedDoctor == null || selectedSlot == null) {
      print("Missing doctor or slot selection");
      return false;
    }

    final patientId = Session.fhirPatientId ?? Session.currentUserId;
    if (patientId == null) {
      print("Missing patient ID in session");
      return false;
    }

    // Create on server (FHIR appointment + slot update)
    try {
      final bookedAppointment = await repository.bookAppointmentWithSlot(
        patientId: patientId,
        practitionerId: selectedDoctor.id,
        slotId: selectedSlot.id,
        start: selectedSlot.rawStart,
        end: selectedSlot.rawEnd,
        appointmentType: "general",
      );

      final serverAppointmentId =
          (bookedAppointment['id'] ?? DateTime.now().millisecondsSinceEpoch)
              .toString();

      _lastBookedAppointmentId = serverAppointmentId;

      final newAppointment = AppointmentHistory(
        id: serverAppointmentId,
        doctor: selectedDoctor,
        date: selectedDate != null
            ? "${selectedDate.day}/${selectedDate.month}/${selectedDate.year}"
            : formattedDate,
        time: selectedTime ?? "",
        status: AppointmentStatus.upcoming,
      );

      _appointments.add(newAppointment);
      notifyListeners();

      // Refresh appointments from backend so Home screen always reflects server state
      await loadAppointmentsForCurrentUser();

      // Refresh slots so newly booked slot is reflected immediately
      await loadDoctorSlots(selectedDoctor.id);

      // Clear selected slot/time after successful booking
      _selectedSlot = null;
      _selectedDate = null;
      _selectedTime = null;
      notifyListeners();
      return true;
    } catch (e) {
      print("Failed to sync booking to server: $e");
      return false;
    }
  }

  Future<bool> sendNotesToDoctor({
    required String appointmentId,
    String? symptomsText,
    String? doctorNote,
    List<String>? documentReferenceIds,
  }) async {
    try {
      await repository.updateAppointmentNotes(
        appointmentId: appointmentId,
        comment: doctorNote,
        symptomsText: symptomsText,
        documentReferenceIds: documentReferenceIds,
      );

      await loadAppointmentsForCurrentUser();
      return true;
    } catch (e) {
      print('Failed to send notes to doctor: $e');
      return false;
    }
  }

  // --- Cancel Appointment ---
  Future<void> cancelAppointment(String id) async {
    final index = _appointments.indexWhere((app) => app.id == id);
    if (index == -1) return;
    final doctorId = _appointments[index].doctor.id;

    final patientId = Session.fhirPatientId ?? Session.currentUserId;
    try {
      await repository.cancelAppointment(id, patientId: patientId);
    } catch (e) {
      print("Failed to cancel appointment on server: $e");
      return;
    }

    // Remove by id instead of stale index to avoid race conditions.
    _appointments.removeWhere((app) => app.id == id);
    notifyListeners();

    try {
      if (doctorId.isNotEmpty) {
        await loadDoctorSlots(doctorId);
      }
      await loadAppointmentsForCurrentUser();
    } catch (e) {
      print("Cancelled on server, but local refresh failed: $e");
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
    print("ALARM: clearBookingData() was called! Stack Trace below:");
    print(StackTrace.current);
    _selectedSpecialty = null;
    _selectedDoctor = null;
    _selectedDate = null;
    _selectedTime = null;
    _selectedSlot = null;
    notifyListeners();
  }
}

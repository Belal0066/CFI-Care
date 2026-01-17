import 'package:flutter/material.dart';
import '../../domain/models/doctors.dart';
import '../../utils/enums/speciality_event.dart'; 
import '../../data/repositories/booking_repo_impl.dart';


class BookingProvider with ChangeNotifier {
  final BookingRepositoryImpl repository;

  BookingProvider(this.repository);
  // --- 1. PRIVATE VARIABLES (The State) ---
  // We make them nullable (?) because at the start, nothing is selected.
  SpecialityEventEnum? _selectedSpecialty;
  Doctor? _selectedDoctor;
  DateTime? _selectedDate;
  String? _selectedTime;

  // --- 2. GETTERS (How UI reads data) ---
  SpecialityEventEnum? get selectedSpecialty => _selectedSpecialty;
  Doctor? get selectedDoctor => _selectedDoctor;
  DateTime? get selectedDate => _selectedDate;
  String? get selectedTime => _selectedTime;

  // Helper: Get formatted date string for UI (e.g., "Mon 19/1/25")
  String get formattedDate {
    if (_selectedDate == null) return "No Date Selected";
    return "${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}";
  }

  // --- 3. SETTERS (How UI updates data) ---
  
  // Step A: Select Specialty
  void setSpecialty(SpecialityEventEnum specialty) {
    _selectedSpecialty = specialty;
    notifyListeners(); // Updates any widget listening to this
  }

  // Step B: Select Doctor
  void selectDoctor(Doctor doctor) {
    _selectedDoctor = doctor;
    // When changing doctor, we usually want to reset the time slot
    _selectedDate = null;
    _selectedTime = null;
    notifyListeners();
  }

  // Step C: Select Time Slot
  void setTimeSlot(DateTime date, String time) {
    _selectedDate = date;
    _selectedTime = time;
    notifyListeners();
  }

  // --- 4. LOGIC & CLEANUP ---

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
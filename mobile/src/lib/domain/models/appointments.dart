class AppointmentDay {
  final String dayName; // "Today", "Tomorrow", "Mon 19/01"
  final DateTime date;// "2024-01-19"
  final String slots; // "02:00 PM\nTo\n09:00 PM" or "No Available Slots"
  final bool isAvailable;
  final List<String> availableSlots;

  AppointmentDay({
    required this.dayName,
    required this.date,
    required this.slots,
    required this.isAvailable,
    required this.availableSlots,
  });
}

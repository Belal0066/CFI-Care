import '../domain/models/appointments.dart'; 

List<AppointmentDay> getNext7Days() {
  final now = DateTime.now();
  final List<String> weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return List.generate(7, (index) {
    // 1. Calculate the actual DateTime object
    final DateTime date = now.add(Duration(days: index));

    // 2. Format the Label for UI: "Sat 17/1/26"
    // (We use this just for the text display on the card)
    final String dayNameStr = weekDays[date.weekday - 1];
    final String label = "$dayNameStr ${date.day}/${date.month}/${date.year % 100}";

    // 3. Define Slots (Mock Logic: Friday is off)
    bool isFriday = date.weekday == DateTime.friday;
    
    List<String> availableSlots = isFriday ? [] : [
      "12:00 PM", "12:30 PM", "01:00 PM", "02:00 PM",
      "05:00 PM", "05:30 PM", "06:00 PM"
    ];

    // 4. Create the "Summary" string
    String slotsSummary = "No Available Slots";
    if (availableSlots.isNotEmpty) {
      slotsSummary = "${availableSlots.first}\nTo\n${availableSlots.last}";
    }

    return AppointmentDay(
      dayName: label,                 // String for UI
      date: date,                     // <--- PASS DateTime OBJECT HERE
      slots: slotsSummary,            
      availableSlots: availableSlots, 
      isAvailable: availableSlots.isNotEmpty,
    );
  });
}
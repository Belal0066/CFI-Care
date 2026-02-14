import 'package:flutter/material.dart';
import 'package:provider/provider.dart'; 
import '../viewmodels/booking_provider.dart';
import '../../domain/models/appointments.dart';
import 'confirmation_screen.dart';

class TimeSlotScreen extends StatefulWidget {
  
  const TimeSlotScreen({super.key});

  @override
  State<TimeSlotScreen> createState() => _TimeSlotScreenState();
}

class _TimeSlotScreenState extends State<TimeSlotScreen> {
  int _expandedIndex = 0; // Open the first available day by default
  String? _selectedTime;

  @override
  Widget build(BuildContext context) {
    // GET DOCTOR FROM PROVIDER
    // We use read() here because we just need the data once to build the list.
    // Use '!' because we are sure a doctor was selected previously.
    final doctor = context.read<BookingProvider>().selectedDoctor!;
    final schedule = doctor.schedule;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        title: const Text(
          "Choose a time slot",
          style: TextStyle(color: Colors.black87),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.black87),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: schedule.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                return _buildDayAccordion(context, index, schedule[index]);
              },
            ),
          ),
          
          // Confirm Button (Only shows if a time is selected)
          if (_selectedTime != null)
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  if (_selectedTime != null) {
                    // --- SAVE TIME SLOT TO PROVIDER ---
                    
                    DateTime selectedDate = schedule[_expandedIndex].date;
                    context.read<BookingProvider>().setTimeSlot(selectedDate, _selectedTime!);

                    // --- NAVIGATE CLEANLY ---
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const ConfirmationScreen(),
                      ),
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFD32F2F), // Red
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  "Confirm $_selectedTime",
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDayAccordion(
    BuildContext context,
    int index,
    AppointmentDay dayData,
  ) {
    final bool isExpanded = index == _expandedIndex;
    final List<String> slots = dayData.availableSlots;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        children: [
          ListTile(
            onTap: () {
              setState(() {
                _expandedIndex = isExpanded ? -1 : index;
                _selectedTime = null; // Reset selection when changing days
              });
            },
            title: Text(
              dayData.dayName,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
            ),
            trailing: Icon(
              isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              color: const Color(0xFF0073CF),
            ),
          ),

          if (isExpanded)
            if (slots.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24.0),
                child: Text(
                  "No slots available",
                  style: TextStyle(color: Colors.grey),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: slots.map((time) {
                    final bool isSelected = time == _selectedTime;
                    return SizedBox(
                      width: (MediaQuery.of(context).size.width - 64) / 3,
                      child: ElevatedButton(
                        onPressed: () {
                          setState(() => _selectedTime = time);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isSelected
                              ? const Color(0xFF005bb5)
                              : const Color(0xFF0073CF),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: Text(
                          time,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
        ],
      ),
    );
  }
}
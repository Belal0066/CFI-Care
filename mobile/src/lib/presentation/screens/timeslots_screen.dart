import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../viewmodels/booking_provider.dart';
import '../../data/repositories/booking_repo_impl.dart';
import 'confirmation_screen.dart';

class TimeSlotScreen extends StatefulWidget {
  final String dayRawDate; // The raw date to filter slots (e.g., "2026-02-16")

  const TimeSlotScreen({super.key, required this.dayRawDate});

  @override
  State<TimeSlotScreen> createState() => _TimeSlotScreenState();
}

class _TimeSlotScreenState extends State<TimeSlotScreen> {
  String? _selectedSlotId;
  String? _selectedTime;

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<BookingProvider>();
    // Filter slots for the selected day only
    final allSlots = provider.availableSlots;
    final slots = allSlots
        .where((slot) => slot.rawDate == widget.dayRawDate)
        .toList();
    final isLoading = provider.isLoadingSlots;
    final error = provider.slotsError;

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
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Text(
                        "Error loading slots: $error",
                        style: const TextStyle(color: Colors.red),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : slots.isEmpty
                ? const Center(
                    child: Text(
                      "No available time slots",
                      style: TextStyle(color: Colors.grey, fontSize: 16),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: slots.length,
                    itemBuilder: (context, index) {
                      return _buildTimeSlotCard(context, slots[index]);
                    },
                  ),
          ),

          // Confirm Button (Only shows if a time is selected)
          if (_selectedTime != null && _selectedSlotId != null)
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  // Navigate to confirmation screen
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const ConfirmationScreen(),
                    ),
                  );
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

  Widget _buildTimeSlotCard(BuildContext context, DoctorSlot slot) {
    final bool isSelected = slot.id == _selectedSlotId;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isSelected ? const Color(0xFF0073CF) : Colors.grey.shade300,
          width: isSelected ? 2 : 1,
        ),
        boxShadow: isSelected
            ? [
                BoxShadow(
                  color: const Color(0xFF0073CF).withOpacity(0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        onTap: () {
          final selectedTime = "${slot.startTime} - ${slot.endTime}";
          context.read<BookingProvider>().selectSlot(slot);
          setState(() {
            _selectedSlotId = slot.id;
            _selectedTime = selectedTime;
          });
        },
        leading: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isSelected
                ? const Color(0xFF0073CF).withOpacity(0.1)
                : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            Icons.access_time,
            color: isSelected ? const Color(0xFF0073CF) : Colors.grey.shade600,
          ),
        ),
        title: Text(
          "${slot.startTime} - ${slot.endTime}",
          style: TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 16,
            color: isSelected ? const Color(0xFF0073CF) : Colors.black87,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              slot.date,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 2),
            Text(
              "Available",
              style: TextStyle(fontSize: 13, color: Colors.green.shade600),
            ),
          ],
        ),
        trailing: isSelected
            ? const Icon(Icons.check_circle, color: Color(0xFF0073CF))
            : Icon(Icons.circle_outlined, color: Colors.grey.shade400),
      ),
    );
  }
}

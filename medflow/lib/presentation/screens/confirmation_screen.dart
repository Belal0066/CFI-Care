import 'package:flutter/material.dart';
import 'package:provider/provider.dart'; 
import '../viewmodels/booking_provider.dart'; 
import 'thank_you_screen.dart';
import '../viewmodels/add_document_viewmodel.dart';

class ConfirmationScreen extends StatelessWidget {
  
  const ConfirmationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // GET DATA FROM PROVIDER
    final booking = context.watch<BookingProvider>();
    
    // Safety check: Ensure data exists (in case of hot reload or error)
    // If you strictly follow the flow, these '!' are safe.
    final doctor = booking.selectedDoctor!;
    final appointmentTime = booking.selectedTime!;
    final appointmentDate = booking.formattedDate; // Using the helper getter we made earlier

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("Confirmation"),
        backgroundColor: const Color(0xFF0073CF),
        elevation: 0,
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  // --- 1. DOCTOR HEADER ---
                  CircleAvatar(
                    radius: 40,
                    backgroundImage: AssetImage(doctor.imageUrl),
                    backgroundColor: Colors.grey.shade200,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    "Doctor ${doctor.name}",
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF4A4A4A)),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    doctor.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14, color: Colors.grey),
                  ),
                  const SizedBox(height: 32),

                  // --- 2. FORM SECTIONS (Timeline Style) ---
                  
                  // Section A: Patient Details
                  _buildTimelineRow(
                    icon: Icons.person_outline,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Checkbox Row
                        Row(
                          children: [
                            SizedBox(
                              height: 24,
                              width: 24,
                              child: Checkbox(
                                value: false, 
                                onChanged: (val) {},
                                activeColor: const Color(0xFF0073CF),
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Expanded(
                              child: Text(
                                "I am booking on behalf of another patient",
                                style: TextStyle(color: Colors.grey, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        
                        // Name Field
                        _buildLabel("Full Name"),
                        TextFormField(
                          initialValue: "Salma Youssef", // Replace with user data provider later
                          decoration: const InputDecoration(
                            isDense: true,
                            contentPadding: EdgeInsets.symmetric(vertical: 8),
                            border: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Phone Field
                        _buildLabel("Phone Number"),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              child: const Text("🇪🇬", style: TextStyle(fontSize: 24)),
                            ),
                            const Icon(Icons.arrow_drop_down, color: Colors.grey),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextFormField(
                                initialValue: "01066890335", // Replace with user data provider later
                                keyboardType: TextInputType.phone,
                                decoration: const InputDecoration(
                                  isDense: true,
                                  contentPadding: EdgeInsets.symmetric(vertical: 8),
                                  border: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Section B: Appointment Date
                  _buildTimelineRow(
                    icon: Icons.calendar_today_outlined,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          appointmentTime, // Use provider data
                          style: const TextStyle(fontSize: 15, color: Colors.black87),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          appointmentDate, // Use provider data
                          style: const TextStyle(fontSize: 14, color: Colors.black87),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Section C: Location
                  _buildTimelineRow(
                    icon: Icons.location_on_outlined,
                    child: Text(
                      doctor.address,
                      style: const TextStyle(fontSize: 14, color: Colors.black87),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Section D: Fees
                  _buildTimelineRow(
                    icon: Icons.monetization_on_outlined,
                    showDivider: false,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text("Fees", style: TextStyle(fontSize: 14, color: Colors.black87)),
                        Text("${doctor.fees} EGP", style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // --- 3. BOTTOM BUTTON ---
          Container(
            padding: const EdgeInsets.all(16),
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.grey.withValues(), blurRadius: 10, offset: const Offset(0, -5))],
            ),
            child: ElevatedButton(
              onPressed: () {
                // 1. Navigate to Thank You
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (context) => ThankYouScreen(
                      appointmentDate: appointmentDate,
                      appointmentTime: appointmentTime,
                      fees: doctor.fees,
                      doctor: doctor,
                      viewModel: DocumentAddViewModel(),
                    )
                  ),
                );

                // 2. Clear Data (Important!)
                // Use read() here since we are inside a callback
                context.read<BookingProvider>().clearBookingData();
                
                // TODO: Send final booking data to backend here
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFD32F2F), // Red
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text("Confirm", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }

  // Helper for the "Timeline" look
  Widget _buildTimelineRow({required IconData icon, required Widget child, bool showDivider = true}) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Left Side: Icon + Vertical Line
          SizedBox(
            width: 40,
            child: Column(
              children: [
                Icon(icon, color: const Color(0xFF0073CF), size: 24),
                const SizedBox(height: 4),
                // Red Dash
                Container(width: 12, height: 2, color: const Color(0xFFD32F2F)),
                const SizedBox(height: 8),
                // Vertical Line
                if (showDivider)
                  Expanded(
                    child: Container(
                      width: 1,
                      color: Colors.grey.shade300,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          // Right Side: Content
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24.0),
              child: child,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(fontSize: 12, color: Colors.grey),
    );
  }
}
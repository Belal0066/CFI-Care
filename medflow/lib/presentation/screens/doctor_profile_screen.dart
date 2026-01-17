import 'package:flutter/material.dart';
import 'package:provider/provider.dart'; 
import '../viewmodels/booking_provider.dart'; 
import '../../domain/models/doctors.dart';
import '../../domain/models/appointments.dart';
import '../../domain/models/review.dart';
import 'timeslots_screen.dart';

class DoctorProfileScreen extends StatelessWidget {
  final Doctor doctor;

  const DoctorProfileScreen({super.key, required this.doctor});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(title: const Text("Doctor Profile"), backgroundColor: const Color(0xFF0073CF)),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // --- HEADER ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 35,
                    backgroundImage: AssetImage(doctor.imageUrl), 
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Doctor ${doctor.name}", 
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0073CF)),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          doctor.title,
                          style: const TextStyle(fontSize: 13, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            
            // --- INFO CARDS ---
            _buildInfoRow(Icons.account_balance_wallet_outlined, "Consultation fees ${doctor.fees} EGP"),
            _buildInfoRow(Icons.access_time, "Waiting time ${doctor.waitingTime} Minutes"),
            _buildInfoRow(Icons.location_on_outlined, doctor.address),

            // --- ABOUT SECTION ---
            _buildExpandableSection("About Doctor", doctor.about ),
            
            const SizedBox(height: 16),

            // --- DYNAMIC APPOINTMENT CALENDAR ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 20),
              width: double.infinity,
              child: Column(
                children: [
                  const Text("Choose your appointment", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 16),
                  
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: doctor.schedule.map((slot) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: _buildDateCard(context, slot),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text("Time slot reservation", style: TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // --- DYNAMIC REVIEWS SECTION ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("Patients' Reviews", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      Text("(${doctor.reviews.length} reviews)", style: const TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  
                  ...doctor.reviews.map((review) => Column(
                    children: [
                      _buildReviewItem(review),
                      const Divider(),
                    ],
                  )).toList(),
                  
                  if (doctor.reviews.isEmpty)
                    const Text("No reviews yet.", style: TextStyle(color: Colors.grey)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- UPDATED DATE CARD WITH PROVIDER LOGIC ---
  Widget _buildDateCard(BuildContext context, AppointmentDay slot) {
    return Container(
      width: 100,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: const BoxDecoration(
              color: Color(0xFF0073CF),
              borderRadius: BorderRadius.vertical(top: Radius.circular(7)),
            ),
            child: Text(
              slot.dayName,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              slot.slots,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: Colors.black87),
            ),
          ),
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: slot.isAvailable ? const Color(0xFFD32F2F) : Colors.grey.shade400,
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(7)),
            ),
            child: TextButton(
              onPressed: slot.isAvailable ? () {
                
                // --- 1. SAVE DOCTOR TO PROVIDER ---
                context.read<BookingProvider>().selectDoctor(doctor);

                // --- 2. NAVIGATE (No arguments needed!) ---
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const TimeSlotScreen(), 
                  ),
                );

              } : null,
              child: const Text("Book", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          )
        ],
      ),
    );
  }

  // Helper Widgets (Same as before)
  Widget _buildReviewItem(Review review) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: List.generate(5, (index) => Icon(
            index < review.rating ? Icons.star : Icons.star_border, 
            color: Colors.amber, 
            size: 16
          )),
        ),
        const SizedBox(height: 4),
        if (review.comment.isNotEmpty)
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              review.comment, 
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 13, color: Colors.black87)
            ),
          ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(review.userName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            Text(review.date, style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ],
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Icon(icon, color: Colors.blue.shade700, size: 22),
          const SizedBox(width: 16),
          Text(text),
        ],
      ),
    );
  }
  
  Widget _buildExpandableSection(String title, String content) {
    return Container(
      color: Colors.white,
      child: ExpansionTile(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        children: [Padding(padding: const EdgeInsets.all(16), child: Text(content))],
      ),
    );
  }
}
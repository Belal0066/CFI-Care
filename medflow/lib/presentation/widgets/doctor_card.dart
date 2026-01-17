import 'package:flutter/material.dart';
import '../../domain/models/doctors.dart';
import '../screens/doctor_profile_screen.dart';
import 'package:provider/provider.dart';
import '../viewmodels/booking_provider.dart';

class DoctorCard extends StatelessWidget {
  final Doctor doctor;

  const DoctorCard({super.key, required this.doctor});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // --- HEADER: IMAGE, NAME, RATING ---
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Avatar
              CircleAvatar(
                radius: 30,
                backgroundImage: AssetImage(
                  doctor.imageUrl,
                ), // Ensure you have assets
                backgroundColor: Colors.grey.shade200,
                child: doctor.imageUrl.contains("http")
                    ? null
                    : const Icon(Icons.person, size: 40, color: Colors.grey),
              ),
              const SizedBox(width: 12),
              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "Doctor ${doctor.name}",
                          style: const TextStyle(
                            color: Color(0xFF0073CF),
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        // if (doctor.isSponsored)
                        //   Container(
                        //     padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        //     decoration: BoxDecoration(color: Colors.amber, borderRadius: BorderRadius.circular(4)),
                        //     child: const Text("Sponsored", style: TextStyle(fontSize: 10, color: Colors.white)),
                        //   ),
                      ],
                    ),
                    Text(
                      doctor.title,
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Stars
                    Row(
                      children: [
                        Row(
                          children: List.generate(
                            5,
                            (index) => Icon(
                              index < doctor.rating.floor()
                                  ? Icons.star
                                  : Icons.star_border,
                              color: Colors.amber,
                              size: 16,
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          "Overall Rating from ${doctor.visitorCount} visitors",
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Tags
                    Wrap(
                      spacing: 8,
                      children: doctor.tags
                          .map((tag) => _buildTag(tag))
                          .toList(),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const Divider(height: 24),

          // --- MIDDLE: DETAILS WITH RED DASH ICONS ---
          _buildDetailRow(
            Icons.medical_services_outlined,
            doctor.specialtyDetail,
          ),
          _buildDetailRow(Icons.location_on_outlined, doctor.address),
          _buildDetailRow(Icons.attach_money, "Fees: ${doctor.fees} EGP"),
          _buildDetailRow(
            Icons.access_time,
            "Waiting Time : ${doctor.waitingTime} Minutes",
            isGreen: true,
          ),

          const SizedBox(height: 16),

          // --- BOTTOM: ACTIONS ---
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Center(
                    child: Text(
                      doctor.nextAvailable,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              ElevatedButton(
                onPressed: () {
                  // Save the doctor to the provider
                  Provider.of<BookingProvider>(
                    context,
                    listen: false,
                  ).selectDoctor(doctor);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => DoctorProfileScreen(doctor: doctor),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFD32F2F), // Red Button
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(4),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                ),
                child: const Text("Book"),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Helper for the Tag (e.g., Hygiene)
  Widget _buildTag(String text) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.clean_hands_outlined,
            size: 12,
            color: Color(0xFF0073CF),
          ), // Placeholder icon
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
          ),
        ],
      ),
    );
  }

  // Helper for the Rows (Icon + Red Dash + Text)
  Widget _buildDetailRow(IconData icon, String text, {bool isGreen = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        children: [
          // Icon Stack with Red Dash
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Icon(icon, size: 18, color: const Color(0xFF0073CF)),
                const SizedBox(height: 2),
                Container(width: 8, height: 2, color: const Color(0xFFD32F2F)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                color: isGreen ? Colors.green : Colors.grey.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

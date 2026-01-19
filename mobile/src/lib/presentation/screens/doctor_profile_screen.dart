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

  // Define primary color for consistency
  final Color primaryColor = const Color(0xFF0073CF);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA), // Softer background
      appBar: AppBar(
        title: const Text("Doctor Profile", style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: primaryColor,
        elevation: 0,
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          children: [
            // --- 1. DOCTOR HEADER CARD ---
            _buildHeaderCard(),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  const SizedBox(height: 16),

                  // --- 2. QUICK STATS ROW (Fees & Waiting Time) ---
                  Row(
                    children: [
                      Expanded(
                        child: _buildStatCard(
                          icon: Icons.monetization_on_outlined,
                          label: "Fees",
                          value: "${doctor.fees} EGP",
                          color: Colors.green,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildStatCard(
                          icon: Icons.timer_outlined,
                          label: "Waiting",
                          value: "${doctor.waitingTime} Min",
                          color: Colors.orange,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),

                  // --- 3. LOCATION CARD ---
                  _buildLocationCard(),

                  const SizedBox(height: 12),

                  // --- 4. ABOUT SECTION ---
                  _buildAboutSection(),

                  const SizedBox(height: 24),

                  // --- 5. BOOKING SECTION ---
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      "Book Appointment",
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.blueGrey.shade800,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 155, // Fixed height for cards
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      physics: const BouncingScrollPhysics(),
                      itemCount: doctor.schedule.length,
                      itemBuilder: (context, index) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 12),
                          child: _buildDateCard(context, doctor.schedule[index]),
                        );
                      },
                    ),
                  ),

                  const SizedBox(height: 24),

                  // --- 6. REVIEWS SECTION ---
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        "Patient Reviews",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.blueGrey.shade800,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: primaryColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          "${doctor.reviews.length} Reviews",
                          style: TextStyle(
                            color: primaryColor,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (doctor.reviews.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(20.0),
                      child: Text("No reviews yet.", style: TextStyle(color: Colors.grey)),
                    )
                  else
                    ...doctor.reviews.map((review) => _buildReviewCard(review)),
                  
                  const SizedBox(height: 30),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- WIDGET BUILDERS ---

  Widget _buildHeaderCard() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(30),
          bottomRight: Radius.circular(30),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
        child: Column(
          children: [
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 4),
                boxShadow: [
                  BoxShadow(color: Colors.black12, blurRadius: 10, offset: const Offset(0, 5))
                ],
              ),
              child: CircleAvatar(
                radius: 50,
                backgroundImage: AssetImage(doctor.imageUrl),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              "Dr. ${doctor.name}",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.blueGrey.shade900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              doctor.title,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: Colors.blueGrey.shade400, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 12),
            // Rating indicator (Optional visual enhancement)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.star, color: Colors.amber, size: 20),
                const SizedBox(width: 4),
                Text(
                  "4.8", // Placeholder or calculate from reviews
                  style: TextStyle(fontWeight: FontWeight.bold, color: Colors.blueGrey.shade800),
                ),
                Text(" (Verified)", style: TextStyle(color: Colors.blueGrey.shade400, fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard({required IconData icon, required String label, required String value, required Color color}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.grey.shade100, blurRadius: 5, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 8),
          Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildLocationCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.grey.shade100, blurRadius: 5, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.location_on, color: primaryColor),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Location", style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                const SizedBox(height: 4),
                Text(doctor.address, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAboutSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.grey.shade100, blurRadius: 5, offset: const Offset(0, 2))],
      ),
      child: Theme(
        data: ThemeData().copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          title: const Text("About Doctor", style: TextStyle(fontWeight: FontWeight.bold)),
          leading: Icon(Icons.info_outline, color: primaryColor),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            Text(
              doctor.about,
              style: TextStyle(color: Colors.blueGrey.shade600, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDateCard(BuildContext context, AppointmentDay slot) {
    bool isAvailable = slot.isAvailable;
    return Container(
      width: 110,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isAvailable ? Colors.transparent : Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Header (Day)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: isAvailable ? primaryColor.withValues(alpha: 0.1) : Colors.grey.shade100,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Text(
              slot.dayName,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: isAvailable ? primaryColor : Colors.grey,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
          
          // Body (Slots info)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              slot.slots,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.blueGrey.shade700,
              ),
            ),
          ),

          // Footer (Button)
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: SizedBox(
              width: double.infinity,
              height: 32,
              child: ElevatedButton(
                onPressed: isAvailable ? () {
                  // --- LOGIC PRESERVED ---
                  context.read<BookingProvider>().selectDoctor(doctor);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const TimeSlotScreen()),
                  );
                } : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: isAvailable ? const Color(0xFFD32F2F) : Colors.grey,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  padding: EdgeInsets.zero,
                ),
                child: Text(
                  isAvailable ? "Book" : "Full",
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReviewCard(Review review) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: Colors.blue.shade50,
                    child: Text(
                      review.userName.isNotEmpty ? review.userName[0].toUpperCase() : "U",
                      style: TextStyle(fontSize: 12, color: primaryColor, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(review.userName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                ],
              ),
              Text(review.date, style: TextStyle(fontSize: 12, color: Colors.grey.shade400)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: List.generate(5, (index) => Icon(
              index < review.rating ? Icons.star : Icons.star_border,
              color: Colors.amber,
              size: 16,
            )),
          ),
          if (review.comment.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.comment,
              style: TextStyle(fontSize: 13, color: Colors.blueGrey.shade700, height: 1.4),
            ),
          ],
        ],
      ),
    );
  }
}
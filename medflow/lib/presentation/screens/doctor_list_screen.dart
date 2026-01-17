import 'package:flutter/material.dart';
import '../../domain/models/doctors.dart';
import '../widgets/doctor_card.dart';
import '../../domain/models/review.dart';
import 'package:provider/provider.dart'; 
import '../viewmodels/booking_provider.dart'; 
import '../../utils/get_next_week.dart';


class DoctorListScreen extends StatelessWidget {
  
  const DoctorListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Read the selected specialty from the Provider
    final bookingProvider = context.watch<BookingProvider>();
    final specialtyEnum = bookingProvider.selectedSpecialty;
    
    // Helper to format Enum to String (e.g. 'cardiology' -> 'Cardiology')
    String getTitle() {
      if (specialtyEnum == null) return "Doctors";
      String name = specialtyEnum.name;
      return name[0].toUpperCase() + name.substring(1);
    }

    // MOCK DATA:
    final List<Doctor> doctors = [
      Doctor(
        id: "doc1",
        name: "Dr. Mohamed Farouk",
        title: "Dermatology consultant",
        imageUrl: "assets/images/doc1.png",
        rating: 4,
        visitorCount: 1066,
        specialtyDetail: "Dermatology specialized in Andrology Genital...",
        address: "Heliopolis: El Khalifa El Mamoun street",
        fees: 750,
        waitingTime: 23,
        nextAvailable: "Available Today 06:00 PM",
        tags: ["Hygiene"],
        schedule: getNext7Days(),
        reviews: [
          Review(
            userName: "Sahar S.",
            date: "27 June 2024",
            rating: 3,
            comment: "ممتازة جدا مستمعة جيدة",
          ),
          Review(
            userName: "Ahmed K.",
            date: "25 June 2024",
            rating: 4,
            comment: "Good doctor but waiting time is long",
          ),
        ],
      ),
      Doctor(
        id: "doc2",
        name: "Dr. Nehal Rezk",
        title: "Specialist of Dermatology , Cosmetic...",
        imageUrl: "assets/images/doc2.png",
        rating: 4.8,
        visitorCount: 785,
        specialtyDetail: "Specialist of Dermatology and Laser",
        address: "Heliopolis: Marghany street",
        fees: 500,
        waitingTime: 15,
        nextAvailable: "Available Tomorrow 10:00 AM",
        tags: ["Good Listener", "Informative"],
        schedule: getNext7Days(),
        reviews: [
          Review(
            userName: "Sahar S.",
            date: "27 June 2024",
            rating: 5,
            comment: "ممتازة جدا مستمعة جيدة",
          ),
          Review(
            userName: "Ahmed K.",
            date: "25 June 2024",
            rating: 4,
            comment: "Good doctor but waiting time is long",
          ),
        ],
      ),
    ];

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0073CF),
        leading: const BackButton(color: Colors.white),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 5. Updated Header to show the selected Specialty
            Text(
              "Searching for ${getTitle()}", 
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
            Row(
              children: const [
                Text(
                  "Heliopolis",
                  style: TextStyle(color: Colors.white, fontSize: 16),
                ),
                Icon(Icons.keyboard_arrow_down, color: Colors.white, size: 20),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // TOP SEARCH & FILTER SECTION
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                // Search Bar
                TextField(
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search, color: Colors.grey),
                    hintText: "Search for doctor or hospital",
                    contentPadding: const EdgeInsets.symmetric(vertical: 0),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                // Filter Buttons Row
                Row(
                  children: [
                    Expanded(child: _buildFilterBtn(Icons.swap_vert, "Sort")),
                    const SizedBox(width: 8),
                    Expanded(child: _buildFilterBtn(Icons.filter_list, "Filter")),
                    const SizedBox(width: 8),
                    Expanded(child: _buildFilterBtn(Icons.map_outlined, "Map")),
                  ],
                ),
              ],
            ),
          ),

          // DOCTOR LIST
          Expanded(
            child: ListView.separated(
              itemCount: doctors.length,
              separatorBuilder: (ctx, index) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                // Ensure DoctorCard can accept these doctor objects
                return DoctorCard(doctor: doctors[index]);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBtn(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade700),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: Colors.grey.shade700)),
        ],
      ),
    );
  }
}
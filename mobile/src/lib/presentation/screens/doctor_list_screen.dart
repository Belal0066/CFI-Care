import 'package:flutter/material.dart';
import '../widgets/doctor_card.dart';
import 'package:provider/provider.dart';
import '../viewmodels/booking_provider.dart';

class DoctorListScreen extends StatefulWidget {
  const DoctorListScreen({super.key});

  @override
  State<DoctorListScreen> createState() => _DoctorListScreenState();
}

class _DoctorListScreenState extends State<DoctorListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Pass the specialty name (e.g., "general medicine", "dermatology")
      final specialty = context.read<BookingProvider>().selectedSpecialty?.name;
      context.read<BookingProvider>().loadDoctors(specialty: specialty);
    });
  }

  @override
  Widget build(BuildContext context) {
    // Read the selected specialty from the Provider
    final bookingProvider = context.watch<BookingProvider>();
    final specialtyEnum = bookingProvider.selectedSpecialty;
    final doctors = bookingProvider.doctors;
    final isLoading = bookingProvider.isLoadingDoctors;
    final loadError = bookingProvider.doctorsError;

    // Helper to format Enum to String
    String getTitle() {
      if (specialtyEnum == null) return "Doctors";
      String name = specialtyEnum.name;
      return name[0].toUpperCase() + name.substring(1);
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA), // Modern soft grey background
      body: Column(
        children: [
          // --- 1. CUSTOM MODERN HEADER ---
          _buildHeader(context, getTitle()),

          // --- 2. FILTERS SECTION ---
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Expanded(child: _buildFilterChip(Icons.sort, "Sort")),
                const SizedBox(width: 10),
                Expanded(child: _buildFilterChip(Icons.tune, "Filter")),
                const SizedBox(width: 10),
                Expanded(child: _buildFilterChip(Icons.map_outlined, "Map")),
              ],
            ),
          ),

          // --- 3. DOCTOR LIST ---
          Expanded(
            child: Builder(
              builder: (context) {
                if (isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (loadError != null) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        "Failed to load doctors\n$loadError",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.red.shade400,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  );
                }
                if (doctors.isEmpty) {
                  return const Center(
                    child: Text(
                      "No doctors found",
                      style: TextStyle(color: Colors.grey, fontSize: 14),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  itemCount: doctors.length,
                  separatorBuilder: (ctx, index) => const SizedBox(height: 16),
                  itemBuilder: (context, index) {
                    return DoctorCard(doctor: doctors[index]);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // --- WIDGET BUILDERS ---

  Widget _buildHeader(BuildContext context, String title) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
        16,
        50,
        16,
        20,
      ), // Top padding for status bar
      decoration: const BoxDecoration(
        color: Color(0xFF0073CF),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(30),
          bottomRight: Radius.circular(30),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 10,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row for Back Button + Location info
          Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const BackButton(color: Colors.white),
              ),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Searching for $title",
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  Row(
                    children: const [
                      Text(
                        "Heliopolis",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Icon(
                        Icons.keyboard_arrow_down,
                        color: Colors.white,
                        size: 20,
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Modern Search Bar
          TextField(
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white,
              prefixIcon: const Icon(Icons.search, color: Color(0xFF0073CF)),
              hintText: "Search for doctor or hospital",
              hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
              contentPadding: const EdgeInsets.symmetric(vertical: 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20), // Rounded capsule shape
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade200,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 18, color: const Color(0xFF0073CF)), // Blue icon
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF333333),
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

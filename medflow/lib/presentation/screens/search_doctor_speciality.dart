import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/models/speciality_data.dart';
import '../widgets/speciality_item.dart';
import '../screens/doctor_list_screen.dart';
import '../../utils/enums/speciality_event.dart';
import '../viewmodels/booking_provider.dart';

class SearchDoctorScreen extends StatefulWidget {
  const SearchDoctorScreen({super.key});

  @override
  State<SearchDoctorScreen> createState() => _SearchDoctorScreenState();
}

class _SearchDoctorScreenState extends State<SearchDoctorScreen> {
  // Data List
  final List<SpecialtyData> _allSpecialties = [
    SpecialtyData('Dermatology', Icons.face_outlined),
    SpecialtyData('Dentistry', Icons.masks_outlined),
    SpecialtyData('Psychiatry', Icons.psychology_outlined),
    SpecialtyData('Pediatrics and New Born', Icons.child_care),
    SpecialtyData('Neurology', Icons.memory),
    SpecialtyData('Orthopedics', Icons.accessibility_new_outlined),
    SpecialtyData('Gynaecology and Infertility', Icons.pregnant_woman),
    SpecialtyData('Ear, Nose and Throat', Icons.hearing_outlined),
    SpecialtyData('Cardiology and Vascular Disease', Icons.favorite_border),
    SpecialtyData('Internal Medicine', Icons.medication_outlined),
    SpecialtyData('General Surgery', Icons.medical_services_outlined),
  ];

  List<SpecialtyData> _foundSpecialties = [];

  @override
  void initState() {
    _foundSpecialties = _allSpecialties;
    super.initState();
  }

  // --- NEW HELPER FUNCTION ---
  // Connects the Display Name (String) to your Logic (Enum)
  SpecialityEventEnum _getSpecialtyEnum(String title) {
    // Normalize string to lowercase for easier matching if needed
    if (title.contains('Dermatology')) return SpecialityEventEnum.dermatology;
    if (title.contains('Dentistry')) return SpecialityEventEnum.dentistry;
    if (title.contains('Psychiatry')) return SpecialityEventEnum.psychiatry;
    if (title.contains('Pediatrics')) return SpecialityEventEnum.pediatrics;
    if (title.contains('Neurology')) return SpecialityEventEnum.neurology;
    if (title.contains('Orthopedics')) return SpecialityEventEnum.orthopedics;
    if (title.contains('Cardiology')) return SpecialityEventEnum.cardiology;
    
    // Add other mappings if you update your Enum file
    // For now, map unknown ones to 'other' or a default
    return SpecialityEventEnum.other; 
  }

  void _runFilter(String enteredKeyword) {
    List<SpecialtyData> results = [];
    if (enteredKeyword.isEmpty) {
      results = _allSpecialties;
    } else {
      results = _allSpecialties
          .where((s) => s.name.toLowerCase().contains(enteredKeyword.toLowerCase()))
          .toList();
    }
    setState(() {
      _foundSpecialties = results;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0073CF), // Fixed Brand Blue
        elevation: 0,
        title: const Text(
          'Search for doctor',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        iconTheme: const IconThemeData(color: Colors.white), // Back button color
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // --- SEARCH BAR ---
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              onChanged: (value) => _runFilter(value),
              decoration: InputDecoration(
                hintText: 'Search for specialty, doctor, or hospital',
                hintStyle: TextStyle(color: Colors.grey.shade500, fontSize: 15),
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(4),
                  borderSide: BorderSide(color: Colors.grey.shade400),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(4),
                  borderSide: BorderSide(color: Colors.grey.shade400),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(4),
                  borderSide: const BorderSide(color: Color(0xFF0073CF)),
                ),
              ),
            ),
          ),

          // --- HEADER ---
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Text(
              'Most Popular Specialties',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF4A4A4A)),
            ),
          ),

          // --- FILTERED LIST ---
          Expanded(
            child: _foundSpecialties.isNotEmpty
                ? ListView.builder(
                    itemCount: _foundSpecialties.length,
                    itemBuilder: (context, index) {
                      return SpecialtyItem(
                        title: _foundSpecialties[index].name,
                        icon: _foundSpecialties[index].icon,
                        onTap: () {
                          // 1. Get the Correct Enum dynamically
                          final selectedEnum = _getSpecialtyEnum(_foundSpecialties[index].name);

                          // 2. Save to Provider
                          context.read<BookingProvider>().setSpecialty(selectedEnum);

                          // 3. Navigate
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const DoctorListScreen(),
                            ),
                          );
                        },
                      );
                    },
                  )
                : const Center(
                    child: Text(
                      'No results found',
                      style: TextStyle(fontSize: 16, color: Colors.grey),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
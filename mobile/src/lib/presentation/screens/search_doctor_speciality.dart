import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/models/speciality_data.dart';
import '../widgets/speciality_item.dart';
import '../screens/doctor_list_screen.dart';
import '../../utils/enums/speciality_event.dart';
import '../viewmodels/booking_provider.dart';
import '../widgets/custom_search_header.dart'; // Your new reusable widget

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

  SpecialityEventEnum _getSpecialtyEnum(String title) {
    if (title.contains('Dermatology')) return SpecialityEventEnum.dermatology;
    if (title.contains('Dentistry')) return SpecialityEventEnum.dentistry;
    if (title.contains('Psychiatry')) return SpecialityEventEnum.psychiatry;
    if (title.contains('Pediatrics')) return SpecialityEventEnum.pediatrics;
    if (title.contains('Neurology')) return SpecialityEventEnum.neurology;
    if (title.contains('Orthopedics')) return SpecialityEventEnum.orthopedics;
    if (title.contains('Cardiology')) return SpecialityEventEnum.cardiology;
    return SpecialityEventEnum.other;
  }

  void _runFilter(String enteredKeyword) {
    List<SpecialtyData> results = [];
    if (enteredKeyword.isEmpty) {
      results = _allSpecialties;
    } else {
      results = _allSpecialties
          .where(
            (s) => s.name.toLowerCase().contains(enteredKeyword.toLowerCase()),
          )
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
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // --- 1. USE THE CUSTOM WIDGET ---
          // This replaces all the complex Rows/Containers you had before
          CustomSearchHeader(
            title: 'Search for doctor',
            hintText: 'Search for specialty, doctor...',
            showBackButton: true,
            onSearchChanged: (value) => _runFilter(value),
          ),

          // --- 2. SECTION TITLE ---
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 24, 16, 10),
            child: Text(
              'Most Popular Specialties',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Color(0xFF4A4A4A),
              ),
            ),
          ),

          // --- 3. LIST OF SPECIALTIES ---
          Expanded(
            child: _foundSpecialties.isNotEmpty
                ? ListView.builder(
                    padding: const EdgeInsets.only(top: 0),
                    itemCount: _foundSpecialties.length,
                    itemBuilder: (context, index) {
                      return SpecialtyItem(
                        title: _foundSpecialties[index].name,
                        icon: _foundSpecialties[index].icon,
                        onTap: () {
                          final selectedEnum = _getSpecialtyEnum(
                            _foundSpecialties[index].name,
                          );
                          // Save to provider
                          context.read<BookingProvider>().setSpecialty(
                                selectedEnum,
                              );
                          // Navigate
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
import 'package:flutter/material.dart';
import 'package:medflow/presentation/widgets/build_section_profile.dart';
import 'package:medflow/presentation/screens/sign_in_up.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../database/db_helper.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:flutter/services.dart';
import 'dart:math';

class MyProfile extends StatefulWidget {
  const MyProfile({super.key});

  @override
  State<MyProfile> createState() => _MyProfileState();
}

class _MyProfileState extends State<MyProfile> {
  bool isLoading = true;

  // Header Data
  String firstName = "";
  String lastName = "";
  String email = "";

  // Section visibility
  bool showPersonal = false;
  bool showMedical = false;
  bool showEmergency = false;
  bool showSharedAccess = false;

  // Editing states
  bool editPersonal = false;
  bool editMedical = false;
  bool editEmergency = false;

  //initial generated code 
  String currentAccessCode = "123456";

  // --- FIX 1: Initialize Maps with DEFAULT KEYS so they are never empty ---
  Map<String, String> personalInfo = {
    'Phone': '',
    'Address': '',
    'Date of Birth': '',
    'Gender': '',
  };

  Map<String, String> medicalInfo = {
    'Blood Type': '',
    'Height (cm)': '',
    'Weight (kg)': '',
    'Allergies': '',
    'Medical Conditions': '',
    'Medications': '',
    'Genetic Conditions': '',
    'Chronic Diseases': '',
  };

  Map<String, String> emergencyInfo = {
    'Emergency Contact': '',
    'Insurance Provider': '',
    'Policy Number': '',
  };

  // Track the current user's ID
  String? currentUserId;

  // Dummy Data for Shared Access
  final List<Map<String, String>> sharedAccounts = [
    {
      'name': 'Martha Doe',
      'relation': 'Mother',
      'id': 'user_002',
      'access': 'Read Only',
    },
    {
      'name': 'Timmy Doe',
      'relation': 'Son',
      'id': 'user_003',
      'access': 'Full Access',
    },
  ];

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _generateNewCode();
  }

  void _generateNewCode() {
    setState(() {
      // Generates a random 6-digit number
      currentAccessCode = (Random().nextInt(900000) + 100000).toString();
    });
  }

  Future<void> _loadProfile() async {
    final prefs = await SharedPreferences.getInstance();
    currentUserId = prefs.getString('currentUserId');

    if (currentUserId == null) {
      setState(() => isLoading = false);
      return;
    }

    Map<String, dynamic>? data = await DBHelper.getUserProfile(currentUserId!);

    if (data != null) {
      setState(() {
        firstName = data['firstName'] ?? 'User';
        lastName = data['lastName'] ?? '';
        email = data['email'] ?? '';

        // Update the maps with real data
        personalInfo = {
          'Phone': data['phone'] ?? '',
          'Address': data['address'] ?? '',
          'Date of Birth': data['dob'] ?? '',
          'Gender': data['gender'] ?? '',
        };

        medicalInfo = {
          'Blood Type': data['bloodType'] ?? '',
          'Height (cm)': data['height'] ?? '',
          'Weight (kg)': data['weight'] ?? '',
          'Allergies': data['allergies'] ?? '',
          'Medical Conditions': data['conditions'] ?? '',
          'Medications': data['medications'] ?? '',
          'Genetic Conditions': data['geneticConditions'] ?? '',
          'Chronic Diseases': data['chronicDiseases'] ?? '',
        };

        emergencyInfo = {
          'Emergency Contact': data['emergencyContact'] ?? '',
          'Insurance Provider': data['insuranceProvider'] ?? '',
          'Policy Number': data['policyNumber'] ?? '',
        };
        isLoading = false;
      });
    } else {
      setState(() => isLoading = false);
    }
  }

  Future<void> _saveChanges() async {
    if (currentUserId == null) return;

    final Map<String, dynamic> updateData = {
      'firstName': firstName,
      'lastName': lastName,
      'email': email,
      'phone': personalInfo['Phone'],
      'address': personalInfo['Address'],
      'dob': personalInfo['Date of Birth'],
      'gender': personalInfo['Gender'],
      'bloodType': medicalInfo['Blood Type'],
      'height': medicalInfo['Height (cm)'],
      'weight': medicalInfo['Weight (kg)'],
      'allergies': medicalInfo['Allergies'],
      'conditions': medicalInfo['Medical Conditions'],
      'medications': medicalInfo['Medications'],
      'geneticConditions': medicalInfo['Genetic Conditions'],
      'chronicDiseases': medicalInfo['Chronic Diseases'],
      'emergencyContact': emergencyInfo['Emergency Contact'],
      'insuranceProvider': emergencyInfo['Insurance Provider'],
      'policyNumber': emergencyInfo['Policy Number'],
    };

    await DBHelper.upsertProfile(currentUserId!, updateData);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    if (isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      extendBodyBehindAppBar: false,
      body: CustomScrollView(
        slivers: [
          const SliverAppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            pinned: false,
            floating: true,
            snap: true,
          ),

          SliverToBoxAdapter(
            child: ListView(
              padding: const EdgeInsets.all(16.0),
              shrinkWrap:
                  true, // Added shrinkWrap safely inside SliverToBoxAdapter
              physics:
                  const NeverScrollableScrollPhysics(), // Let outer scroll view handle scrolling
              children: [
                // --- Profile Header ---
                Center(
                  child: Column(
                    children: [
                      const CircleAvatar(
                        radius: 50,
                        child: Icon(Icons.person, size: 50),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        '$firstName $lastName',
                        style: textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        email,
                        style: textTheme.titleMedium?.copyWith(
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                const Divider(),

                // --- Personal Info Section ---
                BuildSectionProfile(
                  leading: Icons.person_outline_outlined,
                  title: 'Personal Information',
                  show: showPersonal,
                  onToggle: () => setState(() => showPersonal = !showPersonal),
                  onEditToggle: () async {
                    setState(() {
                      editPersonal = !editPersonal;
                      if (editPersonal) showPersonal = true;
                    });
                    if (!editPersonal) await _saveChanges();
                  },
                  isEditing: editPersonal,
                  data: personalInfo,
                ),

                const Divider(),

                // --- Medical Details Section ---
                BuildSectionProfile(
                  leading: Icons.medical_services_outlined,
                  title: 'Medical Details',
                  show: showMedical,
                  onToggle: () => setState(() => showMedical = !showMedical),
                  onEditToggle: () async {
                    setState(() {
                      editMedical = !editMedical;
                      if (editMedical) showMedical = true;
                    });
                    if (!editMedical) await _saveChanges();
                  },
                  isEditing: editMedical,
                  data: medicalInfo,
                ),

                const Divider(),

                // --- Emergency Section ---
                BuildSectionProfile(
                  leading: Icons.emergency_outlined,
                  title: 'Emergency & Insurance',
                  show: showEmergency,
                  onToggle: () =>
                      setState(() => showEmergency = !showEmergency),
                  onEditToggle: () async {
                    setState(() {
                      editEmergency = !editEmergency;
                      if (editEmergency) showEmergency = true;
                    });
                    if (!editEmergency) await _saveChanges();
                  },
                  isEditing: editEmergency,
                  data: emergencyInfo,
                ),

                const Divider(),

                // --- Shared Access Section ---
                _buildSharedAccessSection(textTheme),

                const Divider(),

                // --- Logout ---
                ListTile(
                  leading: const Icon(Icons.logout, color: Colors.red),
                  title: Text(
                    'Logout',
                    style: textTheme.titleMedium?.copyWith(color: Colors.red),
                  ),
                  onTap: () async {
                    final prefs = await SharedPreferences.getInstance();
                    await prefs.clear();
                    if (context.mounted) {
                      Navigator.pushAndRemoveUntil(
                        context,
                        MaterialPageRoute(builder: (_) => const SignInUp()),
                        (r) => false,
                      );
                    }
                  },
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Widget _buildSharedAccessSection(TextTheme textTheme) {
  //   return Column(
  //     children: [
  //       ListTile(
  //         contentPadding: EdgeInsets.zero,
  //         leading: const Icon(Icons.people_outline, color: Colors.blueAccent),
  //         title: Text(
  //           "Shared Access",
  //           style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
  //         ),
  //         trailing: IconButton(
  //           icon: Icon(
  //             showSharedAccess
  //                 ? Icons.keyboard_arrow_up
  //                 : Icons.keyboard_arrow_down,
  //           ),
  //           onPressed: () =>
  //               setState(() => showSharedAccess = !showSharedAccess),
  //         ),
  //       ),
  //       if (showSharedAccess) ...[
  //         ListView.builder(
  //           shrinkWrap: true,
  //           physics: const NeverScrollableScrollPhysics(),
  //           itemCount: sharedAccounts.length,
  //           itemBuilder: (context, index) {
  //             final account = sharedAccounts[index];
  //             return Card(
  //               elevation: 2,
  //               margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
  //               shape: RoundedRectangleBorder(
  //                 borderRadius: BorderRadius.circular(12),
  //               ),
  //               child: ListTile(
  //                 leading: CircleAvatar(
  //                   // --- FIX 2: Use standard withOpacity instead of withValues ---
  //                   backgroundColor: Colors.blueAccent.withValues(),
  //                   child: Text(
  //                     account['name']![0],
  //                     style: const TextStyle(
  //                       color: Colors.blueAccent,
  //                       fontWeight: FontWeight.bold,
  //                     ),
  //                   ),
  //                 ),
  //                 title: Text(
  //                   account['name']!,
  //                   style: const TextStyle(fontWeight: FontWeight.bold),
  //                 ),
  //                 subtitle: Text(
  //                   "${account['relation']} • ${account['access']}",
  //                 ),
  //                 trailing: const Icon(
  //                   Icons.arrow_forward_ios,
  //                   size: 16,
  //                   color: Colors.grey,
  //                 ),
  //                 onTap: () {
  //                   Fluttertoast.showToast(
  //                     msg: "Switching to ${account['name']}'s profile...",
  //                   );
  //                 },
  //               ),
  //             );
  //           },
  //         ),
  //         Padding(
  //           padding: const EdgeInsets.only(top: 8.0),
  //           child: OutlinedButton.icon(
  //             onPressed: () {
  //               // TODO: Logic to add/request new access
  //             },
  //             icon: const Icon(Icons.add),
  //             label: const Text("Request Access to New Account"),
  //           ),
  //         ),
  //       ],
  //     ],
  //   );
  // }
  Widget _buildSharedAccessSection(TextTheme textTheme) {
    return Column(
      children: [
        // Master Toggle Header
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.people_outline, color: Colors.blueAccent),
          title: Text(
            "Shared Access",
            style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          trailing: IconButton(
            icon: Icon(
              showSharedAccess
                  ? Icons.keyboard_arrow_up
                  : Icons.keyboard_arrow_down,
            ),
            onPressed: () =>
                setState(() => showSharedAccess = !showSharedAccess),
          ),
        ),

        if (showSharedAccess) ...[
          const Divider(),

          // --- SECTION 1: FAMILY I CAN ACCESS ---
          _buildSubHeader("Family Members I Can Access"),
          _buildAccountList(
            sharedAccounts.where((a) => a['type'] == 'external').toList(),
          ),

          const SizedBox(height: 16),
          const Divider(),

          // --- SECTION 2: WHO HAS ACCESS TO ME ---
          _buildSubHeader("Doctors & Family Accessing My Data"),
          _buildAccountList(
            sharedAccounts.where((a) => a['type'] == 'authorized').toList(),
          ),

          // --- CODE GENERATOR UI ---
          _buildCodeGeneratorCard(),
        ],
      ],
    );
  }

  // Helper for the sub-section labels
  Widget _buildSubHeader(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.grey,
          ),
        ),
      ),
    );
  }

  // The List of accounts (Reusable)
  Widget _buildAccountList(List<Map<String, String>> accounts) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: accounts.length,
      itemBuilder: (context, index) {
        final account = accounts[index];
        return Card(
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Colors.blueAccent.withOpacity(0.1),
              child: Text(
                account['name']![0],
                style: const TextStyle(color: Colors.blueAccent),
              ),
            ),
            title: Text(
              account['name']!,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: Text("${account['relation']} • ${account['access']}"),
            trailing: const Icon(Icons.arrow_forward_ios, size: 14),
          ),
        );
      },
    );
  }

  // The Random Code Generator Card
  Widget _buildCodeGeneratorCard() {
    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blueAccent.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blueAccent.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          const Text(
            "Share Access Code with Doctor",
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.blueAccent,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // THE CODE
              Text(
                currentAccessCode,
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 4,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(width: 20),
              // COPY BUTTON
              IconButton(
                icon: const Icon(Icons.copy, size: 20),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: currentAccessCode));
                  Fluttertoast.showToast(msg: "Code copied!");
                },
              ),
              // RELOAD BUTTON
              IconButton(
                icon: const Icon(Icons.refresh, color: Colors.green, size: 24),
                onPressed: _generateNewCode, // Calls the refresh logic
              ),
            ],
          ),
          const Text(
            "Valid for 24 hours",
            style: TextStyle(fontSize: 11, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}

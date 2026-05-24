import 'package:flutter/material.dart';
import 'package:medflow/presentation/viewmodels/auth_viewmodel.dart';
import 'package:medflow/presentation/widgets/build_section_profile.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../database/db_helper.dart';
import 'package:fluttertoast/fluttertoast.dart';
import '../widgets/account_sec_section.dart';
import 'package:flutter/services.dart';
import '../viewmodels/access_grant_provider.dart';
import '../viewmodels/patient_provider.dart';
import '../viewmodels/family_access_provider.dart';
import '../viewmodels/proxy_session_provider.dart';
import '../widgets/family_otp_input.dart';
import '../../domain/repository/patient_repository.dart';

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

  // Pending request inline state (per handshakeId)
  final Map<String, int> _pendingDurations = {};
  final Map<String, String> _pendingAccessLevels = {};
  final Map<String, bool> _pendingResponding = {};
  final Map<String, TextEditingController> _durationControllers = {};

  // Revoke state (per practitionerId)
  final Map<String, bool> _revoking = {};

  PatientProvider? _patientProviderRef;

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

  // Family request responding state (per handshakeId)
  final Map<String, bool> _familyResponding = {};

  @override
  void initState() {
    super.initState();
    _loadProfile();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _patientProviderRef = context.read<PatientProvider>();
      _patientProviderRef!.addListener(_syncFromFhir);

      final grantProvider = context.read<AccessGrantProvider>();
      grantProvider.fetchPendingGrants();
      grantProvider.fetchActiveGrants();
      grantProvider.requestOtp();

      final familyProvider = context.read<FamilyAccessProvider>();
      familyProvider.fetchAccessibleMembers();
      familyProvider.fetchPendingRequests();
    });
  }

  @override
  void dispose() {
    _patientProviderRef?.removeListener(_syncFromFhir);
    for (final c in _durationControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _syncFromFhir() {
    final profile = _patientProviderRef?.profile;
    if (profile == null || !mounted) return;
    // Don't overwrite in-progress edits
    if (editPersonal || editMedical || editEmergency) return;
    setState(() {
      if (profile.firstName.isNotEmpty) firstName = profile.firstName;
      if (profile.lastName.isNotEmpty) lastName = profile.lastName;
      if (profile.email.isNotEmpty) email = profile.email;
      if (profile.phone.isNotEmpty) personalInfo['Phone'] = profile.phone;
      if (profile.address.isNotEmpty) personalInfo['Address'] = profile.address;
      if (profile.dob.isNotEmpty) personalInfo['Date of Birth'] = profile.dob;
      if (profile.gender.isNotEmpty) personalInfo['Gender'] = profile.gender;
      if (profile.bloodType.isNotEmpty) medicalInfo['Blood Type'] = profile.bloodType;
      if (profile.height.isNotEmpty) medicalInfo['Height (cm)'] = profile.height;
      if (profile.weight.isNotEmpty) medicalInfo['Weight (kg)'] = profile.weight;
      if (profile.allergies.isNotEmpty) medicalInfo['Allergies'] = profile.allergies;
      if (profile.conditions.isNotEmpty) medicalInfo['Medical Conditions'] = profile.conditions;
      if (profile.medications.isNotEmpty) medicalInfo['Medications'] = profile.medications;
      if (profile.geneticConditions.isNotEmpty) medicalInfo['Genetic Conditions'] = profile.geneticConditions;
      if (profile.chronicDiseases.isNotEmpty) medicalInfo['Chronic Diseases'] = profile.chronicDiseases;
      if (profile.emergencyContact.isNotEmpty) emergencyInfo['Emergency Contact'] = profile.emergencyContact;
      if (profile.insuranceProvider.isNotEmpty) emergencyInfo['Insurance Provider'] = profile.insuranceProvider;
      if (profile.policyNumber.isNotEmpty) emergencyInfo['Policy Number'] = profile.policyNumber;
    });
  }

  Future<void> _loadProfile() async {
    final prefs = await SharedPreferences.getInstance();
    currentUserId = prefs.getString('currentUserId');

    if (currentUserId == null) {
      setState(() => isLoading = false);
      return;
    }

    final data = await DBHelper.getUserProfile(currentUserId!);

    if (data != null) {
      setState(() {
        firstName = data['firstName'] ?? 'User';
        lastName = data['lastName'] ?? '';
        email = data['email'] ?? '';
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

    // Fetch from FHIR in the background — _syncFromFhir() will update UI when done.
    // By the time DB operations complete, addPostFrameCallback has already run
    // and the listener is registered.
    if (mounted) {
      context.read<PatientProvider>().fetchProfile(currentUserId!);
    }
  }

  Future<void> _saveChanges() async {
    if (currentUserId == null) return;

    final updateData = <String, dynamic>{
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

    // Save locally first (fast, offline-safe)
    await DBHelper.upsertProfile(currentUserId!, updateData);

    // Sync to FHIR backend
    if (!mounted) return;
    final profile = PatientProfile(
      patientId: currentUserId!,
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: personalInfo['Phone'] ?? '',
      address: personalInfo['Address'] ?? '',
      dob: personalInfo['Date of Birth'] ?? '',
      gender: personalInfo['Gender'] ?? '',
      bloodType: medicalInfo['Blood Type'] ?? '',
      height: medicalInfo['Height (cm)'] ?? '',
      weight: medicalInfo['Weight (kg)'] ?? '',
      allergies: medicalInfo['Allergies'] ?? '',
      conditions: medicalInfo['Medical Conditions'] ?? '',
      medications: medicalInfo['Medications'] ?? '',
      geneticConditions: medicalInfo['Genetic Conditions'] ?? '',
      chronicDiseases: medicalInfo['Chronic Diseases'] ?? '',
      emergencyContact: emergencyInfo['Emergency Contact'] ?? '',
      insuranceProvider: emergencyInfo['Insurance Provider'] ?? '',
      policyNumber: emergencyInfo['Policy Number'] ?? '',
    );

    final ok = await context.read<PatientProvider>().saveProfile(profile);
    if (mounted && !ok) {
      Fluttertoast.showToast(
        msg: 'Saved locally. Server sync failed — will retry next time.',
        toastLength: Toast.LENGTH_LONG,
      );
    }
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

                AccountSecuritySection(),
                const SizedBox(height: 12),

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

                // --- Switch Back (visible only when proxying) ---
                Consumer<ProxySessionProvider>(
                  builder: (context, proxy, _) {
                    if (!proxy.isProxying) return const SizedBox.shrink();
                    return ListTile(
                      leading: const Icon(
                        Icons.swap_horiz,
                        color: Colors.purple,
                      ),
                      title: Text(
                        'Switch Back to My Profile',
                        style: textTheme.titleMedium?.copyWith(
                          color: Colors.purple,
                        ),
                      ),
                      onTap: proxy.switchBack,
                    );
                  },
                ),

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
                    await context.read<AuthProvider>().logout();
                    // if (context.mounted) {
                    //   Navigator.pushAndRemoveUntil(
                    //     context,
                    //     MaterialPageRoute(builder: (_) => const SignInUp()),
                    //     (r) => false,
                    //   );
                    // }
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

  Widget _buildSharedAccessSection(TextTheme textTheme) {
    final grantProvider = context.watch<AccessGrantProvider>();
    final familyProvider = context.watch<FamilyAccessProvider>();
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

          // --- PENDING DOCTOR ACCESS REQUESTS ---
          _buildPendingRequestsSection(grantProvider),

          // --- PENDING FAMILY ACCESS REQUESTS (y's view) ---
          _buildPendingFamilyRequestsSection(familyProvider),

          // --- SECTION 1: FAMILY I CAN ACCESS ---
          _buildSubHeader("Family Members I Can Access"),
          _buildFamilyOtpInput(familyProvider),
          _buildFamilyMembersList(familyProvider),

          const SizedBox(height: 16),
          const Divider(),

          // --- SECTION 2: DOCTORS WITH ACTIVE ACCESS ---
          _buildSubHeader("Doctors Accessing My Data"),
          _buildActiveGrantsList(grantProvider),

          // --- OTP CARD ---
          _buildCodeGeneratorCard(grantProvider),
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

  Widget _buildPendingRequestsSection(AccessGrantProvider provider) {
    final grants = provider.pendingGrants;
    if (provider.isLoadingPending) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (grants.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(
              Icons.notifications_active,
              color: Colors.orange,
              size: 18,
            ),
            const SizedBox(width: 6),
            Text(
              'Access Requests (${grants.length})',
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.orange,
                fontSize: 13,
              ),
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, size: 18, color: Colors.black45),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: () => provider.fetchPendingGrants(),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ...grants.map((grant) {
          final id = grant.handshakeId;
          final duration = _pendingDurations[id] ?? 60;
          final accessLevel = _pendingAccessLevels[id] ?? 'read';
          final responding = _pendingResponding[id] ?? false;

          List<String> scopes() {
            if (accessLevel == 'write') return ['read', 'write'];
            if (accessLevel == 'full_access') return ['full_access'];
            return ['read'];
          }

          Future<void> respond(bool approved) async {
            setState(() => _pendingResponding[id] = true);
            final ok = await provider.respondToGrant(
              handshakeId: id,
              approved: approved,
              durationMinutes: duration,
              scopes: scopes(),
            );
            if (mounted) {
              setState(() => _pendingResponding.remove(id));
              if (approved && ok) provider.fetchActiveGrants();
              Fluttertoast.showToast(
                msg: ok
                    ? (approved ? 'Access granted' : 'Request denied')
                    : 'Something went wrong. Try again.',
              );
            }
          }

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.orange.withValues(alpha: 0.3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      radius: 18,
                      backgroundColor: Color(0xFFDDEAF9),
                      child: Icon(
                        Icons.person_outline,
                        color: Color(0xFF1E6ED3),
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Practitioner',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.black45,
                            ),
                          ),
                          Text(
                            provider.practitionerName(grant.practitionerId),
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade50,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.orange.shade200),
                      ),
                      child: Text(
                        'Pending',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.orange.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Duration',
                  style: TextStyle(fontSize: 11, color: Colors.black45),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    for (final preset in [30, 60, 240])
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: GestureDetector(
                          onTap: () {
                            setState(() => _pendingDurations[id] = preset);
                            _durationControllers[id]?.clear();
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: duration == preset
                                  ? const Color(0xFF1E6ED3)
                                  : const Color(0xFFF1F4F8),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: duration == preset
                                    ? const Color(0xFF1E6ED3)
                                    : const Color(0xFFDDE3EC),
                              ),
                            ),
                            child: Text(
                              preset < 60 ? '${preset}m' : '${preset ~/ 60}h',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: duration == preset
                                    ? Colors.white
                                    : Colors.black87,
                              ),
                            ),
                          ),
                        ),
                      ),
                    Expanded(
                      child: TextField(
                        controller: _durationControllers.putIfAbsent(
                          id,
                          () => TextEditingController(),
                        ),
                        keyboardType: TextInputType.number,
                        style: const TextStyle(fontSize: 13),
                        decoration: InputDecoration(
                          hintText: 'Custom',
                          suffixText: 'min',
                          suffixStyle: const TextStyle(
                            fontSize: 12,
                            color: Colors.black45,
                          ),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(
                              color: Color(0xFFDDE3EC),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(
                              color: Color(0xFF1E6ED3),
                            ),
                          ),
                        ),
                        onChanged: (val) {
                          final parsed = int.tryParse(val);
                          if (parsed != null && parsed > 0) {
                            setState(() => _pendingDurations[id] = parsed);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Access level',
                  style: TextStyle(fontSize: 11, color: Colors.black45),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final entry in [
                      ('read', 'Read', Colors.blue),
                      ('write', 'Read+Write', Colors.orange),
                      ('full_access', 'Full Access', Colors.red),
                    ])
                      GestureDetector(
                        onTap: () =>
                            setState(() => _pendingAccessLevels[id] = entry.$1),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: accessLevel == entry.$1
                                ? entry.$3.withValues(alpha: 0.12)
                                : const Color(0xFFF1F4F8),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: accessLevel == entry.$1
                                  ? entry.$3
                                  : const Color(0xFFDDE3EC),
                            ),
                          ),
                          child: Text(
                            entry.$2,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: accessLevel == entry.$1
                                  ? entry.$3
                                  : Colors.black54,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: responding ? null : () => respond(false),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          minimumSize: const Size(0, 40),
                        ),
                        child: responding
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text(
                                'Deny',
                                style: TextStyle(fontSize: 13),
                              ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: responding ? null : () => respond(true),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E6ED3),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          minimumSize: const Size(0, 40),
                        ),
                        child: responding
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                'Approve',
                                style: TextStyle(fontSize: 13),
                              ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 8),
      ],
    );
  }

  // ----------------------------------------------------------------
  // FAMILY — OTP input (x enters y's 6-digit code)
  // ----------------------------------------------------------------
  Widget _buildFamilyOtpInput(FamilyAccessProvider provider) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: FamilyOtpInput(
        isSubmitting: provider.isSubmitting,
        errorText: provider.submitError,
        onSubmit: (code) async {
          final ok = await provider.submitCode(code);
          if (mounted) {
            Fluttertoast.showToast(
              msg: ok
                  ? 'Request sent — waiting for their approval'
                  : (provider.submitError ?? 'Failed. Try again.'),
            );
          }
        },
      ),
    );
  }

  // ----------------------------------------------------------------
  // FAMILY — list of patients x can access
  // ----------------------------------------------------------------
  Widget _buildFamilyMembersList(FamilyAccessProvider provider) {
    if (provider.isLoadingMembers) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (provider.accessibleMembers.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: Text(
          'No family members added yet.',
          style: TextStyle(fontSize: 12, color: Colors.black45),
        ),
      );
    }
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: provider.accessibleMembers.length,
      itemBuilder: (context, index) {
        final member = provider.accessibleMembers[index];
        return Card(
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Colors.blueAccent.withValues(alpha: 0.1),
              child: Text(
                member.name.isNotEmpty ? member.name[0].toUpperCase() : '?',
                style: const TextStyle(
                  color: Colors.blueAccent,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            title: Text(
              member.name,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: const Text('Full Access'),
            trailing: const Icon(Icons.arrow_forward_ios, size: 14),
            onTap: () {
              context
                  .read<ProxySessionProvider>()
                  .switchTo(member.patientId, member.name);
              Fluttertoast.showToast(
                msg: "Switching to ${member.name}'s profile…",
              );
            },
          ),
        );
      },
    );
  }

  // ----------------------------------------------------------------
  // FAMILY — pending requests y received (y's view, Accept / Deny)
  // ----------------------------------------------------------------
  Widget _buildPendingFamilyRequestsSection(FamilyAccessProvider provider) {
    if (provider.isLoadingPending) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (provider.pendingRequests.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.family_restroom, color: Colors.purple, size: 18),
            const SizedBox(width: 6),
            Text(
              'Family Access Requests (${provider.pendingRequests.length})',
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.purple,
                fontSize: 13,
              ),
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, size: 18, color: Colors.black45),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: provider.fetchPendingRequests,
            ),
          ],
        ),
        const SizedBox(height: 6),
        ...provider.pendingRequests.map((req) {
          final responding = _familyResponding[req.handshakeId] ?? false;

          Future<void> respond(bool approved) async {
            setState(() => _familyResponding[req.handshakeId] = true);
            final ok = await provider.respondToRequest(
              req.handshakeId,
              approved,
            );
            if (mounted) {
              setState(() => _familyResponding.remove(req.handshakeId));
              Fluttertoast.showToast(
                msg: ok
                    ? (approved ? 'Access granted' : 'Request denied')
                    : 'Something went wrong. Try again.',
              );
            }
          }

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.purple.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.purple.withValues(alpha: 0.3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      radius: 18,
                      backgroundColor: Color(0xFFEDE7F6),
                      child: Icon(
                        Icons.person_outline,
                        color: Colors.purple,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Family Member',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.black45,
                            ),
                          ),
                          Text(
                            req.requesterName,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.purple.shade50,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.purple.shade200),
                      ),
                      child: Text(
                        'Pending',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.purple.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: responding ? null : () => respond(false),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          minimumSize: const Size(0, 40),
                        ),
                        child: responding
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.red,
                                ),
                              )
                            : const Text('Deny', style: TextStyle(fontSize: 13)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: responding ? null : () => respond(true),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.purple,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          minimumSize: const Size(0, 40),
                        ),
                        child: responding
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                'Approve',
                                style: TextStyle(fontSize: 13),
                              ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildActiveGrantsList(AccessGrantProvider provider) {
    if (provider.isLoadingActive) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (provider.activeError != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            const Icon(Icons.error_outline, size: 16, color: Colors.red),
            const SizedBox(width: 6),
            const Expanded(
              child: Text(
                'Failed to load. Tap to retry.',
                style: TextStyle(fontSize: 12, color: Colors.red),
              ),
            ),
            TextButton(
              onPressed: () => provider.fetchActiveGrants(),
              child: const Text('Retry', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      );
    }
    if (provider.activeGrants.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Text(
          'No doctors currently have access to your data.',
          style: TextStyle(fontSize: 12, color: Colors.black45),
        ),
      );
    }
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: provider.activeGrants.length,
      itemBuilder: (context, index) {
        final grant = provider.activeGrants[index];
        final minsLeft = grant.minutesRemaining;
        final isRevoking = _revoking[grant.practitionerId] ?? false;
        return Card(
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: Colors.blueAccent.withValues(alpha: 0.1),
                      child: const Icon(
                        Icons.medical_services_outlined,
                        color: Colors.blueAccent,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            provider.practitionerName(grant.practitionerId),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '${grant.scopes.join(', ')} • ${minsLeft > 0 ? 'Expires in $minsLeft min' : 'Expired'}',
                            style: TextStyle(
                              fontSize: 11,
                              color: minsLeft < 10
                                  ? Colors.red
                                  : Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.green.shade200),
                      ),
                      child: Text(
                        'Active',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.green.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Divider(height: 1),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: isRevoking
                        ? null
                        : () async {
                            setState(
                              () => _revoking[grant.practitionerId] = true,
                            );
                            final ok = await provider.revokeGrant(
                              grant.practitionerId,
                            );
                            if (mounted) {
                              setState(
                                () => _revoking.remove(grant.practitionerId),
                              );
                              Fluttertoast.showToast(
                                msg: ok
                                    ? 'Access revoked'
                                    : 'Failed to revoke. Try again.',
                              );
                            }
                          },
                    icon: isRevoking
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.red,
                            ),
                          )
                        : const Icon(Icons.remove_circle_outline, size: 16),
                    label: Text(
                      isRevoking ? 'Revoking…' : 'Revoke Access',
                      style: const TextStyle(fontSize: 13),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      minimumSize: const Size(0, 40),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildCodeGeneratorCard(AccessGrantProvider provider) {
    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blueAccent.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blueAccent.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          const Text(
            'Share Access Code with Doctor',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.blueAccent,
            ),
          ),
          const SizedBox(height: 12),
          if (provider.isRequestingOtp)
            const CircularProgressIndicator()
          else if (provider.otpError != null)
            Column(
              children: [
                const Text(
                  'Failed to generate code.',
                  style: TextStyle(fontSize: 12, color: Colors.red),
                ),
                TextButton(
                  onPressed: () => provider.requestOtp(),
                  child: const Text('Retry'),
                ),
              ],
            )
          else ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  provider.otp?.otp ?? '------',
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 4,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(width: 20),
                IconButton(
                  icon: const Icon(Icons.copy, size: 20),
                  onPressed: () {
                    final code = provider.otp?.otp;
                    if (code != null) {
                      Clipboard.setData(ClipboardData(text: code));
                      Fluttertoast.showToast(msg: 'Code copied!');
                    }
                  },
                ),
                IconButton(
                  icon: const Icon(
                    Icons.refresh,
                    color: Colors.green,
                    size: 24,
                  ),
                  onPressed: () => provider.requestOtp(),
                ),
              ],
            ),
            Text(
              provider.otp != null
                  ? 'Valid for ${provider.otp!.expiresIn}'
                  : 'Tap refresh to generate a code',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ],
      ),
    );
  }
}

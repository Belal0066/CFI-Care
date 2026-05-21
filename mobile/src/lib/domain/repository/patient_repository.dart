import 'dart:convert';
import '../../data/services/datasources/api_service_booking.dart';

const _extBase = 'http://medflow.app/fhir/extension';

// Converts any common date format to YYYY-MM-DD required by FHIR.
// Handles: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY/MM/DD, already-correct YYYY-MM-DD.
String _normalizeDob(String raw) {
  if (raw.isEmpty) return raw;
  if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(raw)) return raw;

  // DD/MM/YYYY  or  DD-MM-YYYY  or  DD.MM.YYYY
  final dm = RegExp(r'^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$').firstMatch(raw);
  if (dm != null) {
    final d = dm.group(1)!.padLeft(2, '0');
    final m = dm.group(2)!.padLeft(2, '0');
    final y = dm.group(3)!;
    return '$y-$m-$d';
  }

  // YYYY/MM/DD  or  YYYY.MM.DD
  final yd = RegExp(r'^(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})$').firstMatch(raw);
  if (yd != null) {
    final y = yd.group(1)!;
    final m = yd.group(2)!.padLeft(2, '0');
    final d = yd.group(3)!.padLeft(2, '0');
    return '$y-$m-$d';
  }

  return raw;
}

class PatientProfile {
  final String patientId;
  final String firstName;
  final String lastName;
  final String email;
  final String phone;
  final String address;
  final String dob;
  final String gender;
  final String bloodType;
  final String height;
  final String weight;
  final String allergies;
  final String conditions;
  final String medications;
  final String geneticConditions;
  final String chronicDiseases;
  final String emergencyContact;
  final String insuranceProvider;
  final String policyNumber;

  const PatientProfile({
    required this.patientId,
    this.firstName = '',
    this.lastName = '',
    this.email = '',
    this.phone = '',
    this.address = '',
    this.dob = '',
    this.gender = '',
    this.bloodType = '',
    this.height = '',
    this.weight = '',
    this.allergies = '',
    this.conditions = '',
    this.medications = '',
    this.geneticConditions = '',
    this.chronicDiseases = '',
    this.emergencyContact = '',
    this.insuranceProvider = '',
    this.policyNumber = '',
  });

  factory PatientProfile.fromFhir(Map<String, dynamic> fhir) {
    final names = fhir['name'] as List? ?? [];
    final nameMap = names.isNotEmpty ? names[0] as Map<String, dynamic> : <String, dynamic>{};
    final given = (nameMap['given'] as List?)?.map((e) => e.toString()).join(' ') ?? '';
    final family = nameMap['family'] as String? ?? '';

    final telecom = fhir['telecom'] as List? ?? [];
    var phone = '';
    var email = '';
    for (final t in telecom) {
      final m = t as Map<String, dynamic>;
      if (m['system'] == 'phone') phone = m['value'] as String? ?? '';
      if (m['system'] == 'email') email = m['value'] as String? ?? '';
    }

    final addresses = fhir['address'] as List? ?? [];
    var address = '';
    if (addresses.isNotEmpty) {
      final a = addresses[0] as Map<String, dynamic>;
      address = a['text'] as String? ??
          (a['line'] as List?)?.map((e) => e.toString()).join(', ') ?? '';
    }

    final exts = fhir['extension'] as List? ?? [];
    String ext(String key) {
      for (final e in exts) {
        final m = e as Map<String, dynamic>;
        if ((m['url'] as String? ?? '').endsWith('/$key')) {
          return m['valueString'] as String? ?? '';
        }
      }
      return '';
    }

    return PatientProfile(
      patientId: fhir['id'] as String? ?? '',
      firstName: given,
      lastName: family,
      email: email,
      phone: phone,
      address: address,
      dob: fhir['birthDate'] as String? ?? '',
      gender: fhir['gender'] as String? ?? '',
      bloodType: ext('blood-type'),
      height: ext('height'),
      weight: ext('weight'),
      allergies: ext('allergies'),
      conditions: ext('conditions'),
      medications: ext('medications'),
      geneticConditions: ext('genetic-conditions'),
      chronicDiseases: ext('chronic-diseases'),
      emergencyContact: ext('emergency-contact'),
      insuranceProvider: ext('insurance-provider'),
      policyNumber: ext('policy-number'),
    );
  }

  Map<String, dynamic> toFhir() {
    final extensions = <Map<String, dynamic>>[];
    void addExt(String key, String value) {
      if (value.isNotEmpty) {
        extensions.add({'url': '$_extBase/$key', 'valueString': value});
      }
    }

    addExt('blood-type', bloodType);
    addExt('height', height);
    addExt('weight', weight);
    addExt('allergies', allergies);
    addExt('conditions', conditions);
    addExt('medications', medications);
    addExt('genetic-conditions', geneticConditions);
    addExt('chronic-diseases', chronicDiseases);
    addExt('emergency-contact', emergencyContact);
    addExt('insurance-provider', insuranceProvider);
    addExt('policy-number', policyNumber);

    final telecom = <Map<String, dynamic>>[];
    if (phone.isNotEmpty) telecom.add({'system': 'phone', 'value': phone, 'use': 'mobile'});
    if (email.isNotEmpty) telecom.add({'system': 'email', 'value': email, 'use': 'home'});

    return {
      'resourceType': 'Patient',
      'id': patientId,
      'name': [
        {
          'use': 'official',
          'family': lastName.isNotEmpty ? lastName : 'Unknown',
          'given': firstName.isNotEmpty ? firstName.split(' ') : ['User'],
        }
      ],
      if (telecom.isNotEmpty) 'telecom': telecom,
      'gender': gender.isNotEmpty ? gender.toLowerCase() : 'unknown',
      if (dob.isNotEmpty) 'birthDate': _normalizeDob(dob),
      if (address.isNotEmpty) 'address': [{'use': 'home', 'text': address}],
      if (extensions.isNotEmpty) 'extension': extensions,
    };
  }

  PatientProfile copyWith({
    String? firstName,
    String? lastName,
    String? email,
    String? phone,
    String? address,
    String? dob,
    String? gender,
    String? bloodType,
    String? height,
    String? weight,
    String? allergies,
    String? conditions,
    String? medications,
    String? geneticConditions,
    String? chronicDiseases,
    String? emergencyContact,
    String? insuranceProvider,
    String? policyNumber,
  }) => PatientProfile(
    patientId: patientId,
    firstName: firstName ?? this.firstName,
    lastName: lastName ?? this.lastName,
    email: email ?? this.email,
    phone: phone ?? this.phone,
    address: address ?? this.address,
    dob: dob ?? this.dob,
    gender: gender ?? this.gender,
    bloodType: bloodType ?? this.bloodType,
    height: height ?? this.height,
    weight: weight ?? this.weight,
    allergies: allergies ?? this.allergies,
    conditions: conditions ?? this.conditions,
    medications: medications ?? this.medications,
    geneticConditions: geneticConditions ?? this.geneticConditions,
    chronicDiseases: chronicDiseases ?? this.chronicDiseases,
    emergencyContact: emergencyContact ?? this.emergencyContact,
    insuranceProvider: insuranceProvider ?? this.insuranceProvider,
    policyNumber: policyNumber ?? this.policyNumber,
  );
}

class PatientRepository {
  final ApiService apiService;
  PatientRepository(this.apiService);

  Future<PatientProfile?> fetchPatient(String patientId) async {
    final response = await apiService.getData(endpoint: '/patients/$patientId');
    if (response.statusCode == 200) {
      return PatientProfile.fromFhir(
        json.decode(response.body) as Map<String, dynamic>,
      );
    }
    return null;
  }

  Future<void> updatePatient(PatientProfile profile) async {
    final response = await apiService.putData(
      endpoint: '/patients/${profile.patientId}',
      data: profile.toFhir(),
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Update failed (${response.statusCode}): ${response.body}');
    }
  }
}

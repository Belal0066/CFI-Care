// Y's view of a patient (X) they can proxy-access.
// Parsed from GET /api/caregiver-grants/my-patients → { patients: [...] }
class FamilyMember {
  final String patientId;
  final String name;
  final int? age;
  final String? grantExpiresAt;

  FamilyMember({
    required this.patientId,
    required this.name,
    this.age,
    this.grantExpiresAt,
  });

  factory FamilyMember.fromJson(Map<String, dynamic> json) {
    return FamilyMember(
      patientId: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unknown',
      age: json['age'] as int?,
      grantExpiresAt: json['grantExpiresAt']?.toString(),
    );
  }
}

// Pending request from Y that X hasn't approved yet.
// Parsed from GET /api/handshakes/pending → { pending: [...] }
class PendingFamilyRequest {
  final String handshakeId;
  final String requesterId;
  final String requesterName;
  final String requesterType;
  final String caregiverRoleAssignment;
  final String createdAt;

  PendingFamilyRequest({
    required this.handshakeId,
    required this.requesterId,
    required this.requesterName,
    required this.requesterType,
    required this.caregiverRoleAssignment,
    required this.createdAt,
  });

  // A request is a "family" request if the requester is already a caregiver,
  // OR if they're a patient being onboarded as a caregiver for the first time.
  bool get isFamilyRequest =>
      requesterType == 'caregiver' || caregiverRoleAssignment.isNotEmpty;

  factory PendingFamilyRequest.fromJson(Map<String, dynamic> json) {
    return PendingFamilyRequest(
      handshakeId: json['handshakeId']?.toString() ?? '',
      requesterId: json['requesterId']?.toString() ?? '',
      requesterName: json['requesterName']?.toString() ?? 'Unknown',
      requesterType: json['requesterType']?.toString() ?? '',
      caregiverRoleAssignment: json['caregiverRoleAssignment']?.toString() ?? '',
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

// X's view of a family member (Y) who currently has active access to X's data.
// Parsed from GET /api/patient-grants/grants → caregivers array
class FamilyAccessor {
  final String requesterId;
  final String requesterName;
  final List<String> scopes;
  final String expiresAt;

  FamilyAccessor({
    required this.requesterId,
    required this.requesterName,
    required this.scopes,
    required this.expiresAt,
  });

  factory FamilyAccessor.fromJson(Map<String, dynamic> json) {
    final rawScopes = json['scopes'];
    final scopes = rawScopes is List
        ? rawScopes.map((s) => s.toString()).toList()
        : <String>[];
    return FamilyAccessor(
      requesterId: json['requesterId']?.toString() ?? '',
      requesterName: json['requesterName']?.toString() ?? 'Unknown',
      scopes: scopes,
      expiresAt: json['expiresAt']?.toString() ?? '',
    );
  }

  int get minutesRemaining {
    final exp = DateTime.tryParse(expiresAt);
    if (exp == null) return 0;
    return (exp.difference(DateTime.now()).inSeconds / 60).ceil().clamp(0, 99999);
  }
}

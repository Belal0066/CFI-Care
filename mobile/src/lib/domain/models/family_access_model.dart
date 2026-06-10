class FamilyMember {
  final String patientId;
  final String name;
  final String grantId;

  FamilyMember({
    required this.patientId,
    required this.name,
    required this.grantId,
  });

  factory FamilyMember.fromJson(Map<String, dynamic> json) {
    return FamilyMember(
      patientId: json['patientId']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unknown',
      grantId: json['grantId']?.toString() ?? '',
    );
  }
}

class PendingFamilyRequest {
  final String handshakeId;
  final String requesterId;
  final String requesterName;
  final String createdAt;

  PendingFamilyRequest({
    required this.handshakeId,
    required this.requesterId,
    required this.requesterName,
    required this.createdAt,
  });

  factory PendingFamilyRequest.fromJson(Map<String, dynamic> json) {
    return PendingFamilyRequest(
      handshakeId: json['handshakeId']?.toString() ?? '',
      requesterId: json['requesterId']?.toString() ?? '',
      requesterName: json['requesterName']?.toString() ?? 'Unknown',
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

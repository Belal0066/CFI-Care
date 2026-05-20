class OtpResponse {
  final String otp;
  final String expiresIn;

  OtpResponse({required this.otp, required this.expiresIn});

  factory OtpResponse.fromJson(Map<String, dynamic> json) {
    return OtpResponse(
      otp: json['otp']?.toString() ?? '',
      expiresIn: json['expiresIn']?.toString() ?? '10 min',
    );
  }
}

class PendingGrant {
  final String handshakeId;
  final String patientId;
  final String practitionerId;
  final String createdAt;

  PendingGrant({
    required this.handshakeId,
    required this.patientId,
    required this.practitionerId,
    required this.createdAt,
  });

  factory PendingGrant.fromJson(Map<String, dynamic> json) {
    return PendingGrant(
      handshakeId: json['handshakeId']?.toString() ?? '',
      patientId: json['patientId']?.toString() ?? '',
      practitionerId: json['practitionerId']?.toString() ?? '',
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}

class Grant {
  final String grantId;
  final String patientId;
  final String practitionerId;
  final String status;
  final List<String> scopes;
  final String createdAt;
  final String expiresAt;

  Grant({
    required this.grantId,
    required this.patientId,
    required this.practitionerId,
    required this.status,
    required this.scopes,
    required this.createdAt,
    required this.expiresAt,
  });

  factory Grant.fromJson(Map<String, dynamic> json) {
    final rawScopes = json['scopes'];
    final scopes = rawScopes is List
        ? rawScopes.map((s) => s.toString()).toList()
        : <String>[];
    return Grant(
      grantId: json['grantId']?.toString() ?? '',
      patientId: json['patientId']?.toString() ?? '',
      practitionerId: json['practitionerId']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      scopes: scopes,
      createdAt: json['createdAt']?.toString() ?? '',
      expiresAt: json['expiresAt']?.toString() ?? '',
    );
  }

  int get minutesRemaining {
    final exp = DateTime.tryParse(expiresAt);
    if (exp == null) return 0;
    return (exp.difference(DateTime.now()).inSeconds / 60).ceil().clamp(0, 99999);
  }
}

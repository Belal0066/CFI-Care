class MajorEvent {
  final String id;
  final String title;
  final String status; // "CONFLICT", "RESOLVED", "PLANNED"
  final String? periodStart;

  MajorEvent({
    required this.id,
    required this.title,
    required this.status,
    this.periodStart,
  });

  factory MajorEvent.fromJson(Map<String, dynamic> json) {
    // title lives in FHIR type[0].text
    String title = 'Unknown Episode';
    final typeList = json['type'] as List<dynamic>?;
    if (typeList != null && typeList.isNotEmpty) {
      final first = typeList[0];
      if (first is Map<String, dynamic>) {
        title = first['text']?.toString() ?? title;
      }
    }

    final period = json['period'] as Map<String, dynamic>?;
    final rawStatus = json['status']?.toString() ?? '';

    return MajorEvent(
      id: json['id']?.toString() ?? '',
      title: title,
      status: _mapFhirStatus(rawStatus),
      periodStart: period?['start']?.toString(),
    );
  }

  // Maps FHIR EpisodeOfCare status values to the app's three display states.
  static String _mapFhirStatus(String fhirStatus) {
    switch (fhirStatus.toLowerCase()) {
      case 'finished':
        return 'RESOLVED';
      case 'active':
        return 'PLANNED';
      default:
        // waitlist, onhold, cancelled, entered-in-error
        return 'CONFLICT';
    }
  }
}

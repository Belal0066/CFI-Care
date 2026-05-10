class EventNode {
  final String id;
  final String title;
  final String date;
  final String details;
  final String documentUrl; // encounter FHIR ID or empty
  final String category;   // Consultation, Lab, Imaging, Prescription, etc.
  final String priority;   // Low, Medium, High
  final String normality;  // Normal, Abnormal, Pending

  EventNode({
    required this.id,
    required this.title,
    required this.date,
    required this.details,
    required this.documentUrl,
    this.category = '',
    this.priority = '',
    this.normality = '',
  });

  // Parses a graph node returned by GET /api/historyGraph/{patientId}?eocId=...
  // The backend wraps nodes in { nodes: [...], eocId, pagination }.
  factory EventNode.fromJson(Map<String, dynamic> json) {
    return EventNode(
      id: json['id']?.toString() ?? '',
      title: json['text_1']?.toString() ?? json['title']?.toString() ?? 'Untitled',
      date: json['dateIssued']?.toString() ??
          (json['createdAt']?.toString() ?? '').split('T').first,
      details: json['details']?.toString() ?? '',
      documentUrl: json['id']?.toString() ?? '', // encounter FHIR ID
      category: json['category']?.toString() ?? '',
      priority: json['priority']?.toString() ?? '',
      normality: json['normality']?.toString() ?? '',
    );
  }
}

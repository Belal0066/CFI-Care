class EventNode {
  final String id;
  final String title;
  final String date;     // Keep as String for simplicity, or DateTime
  final String details;
  final String documentUrl; // URL or Path to file

  EventNode({
    required this.id,
    required this.title,
    required this.date,
    required this.details,
    required this.documentUrl,
  });
}
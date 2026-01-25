class MajorEvent {
  final String id;
  final String title;
  final String status; // "CONFLICT", "RESOLVED", "PLANNED"

  MajorEvent({
    required this.id, 
    required this.title, 
    required this.status
  });
}
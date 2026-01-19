import '../../domain/models/major_event.dart';
import '../../domain/models/event_node.dart';

class MajorEventRepository {
  //TODO: Replace with real API calls
  // Fetch Major Events
  Future<List<MajorEvent>> getMajorEvents() async {
    await Future.delayed(const Duration(milliseconds: 500)); // Simulate API delay
    return [
      MajorEvent(id: '1', title: "Cardiac Workup with very long title to test overflow behavior", status: "CONFLICT"),
      MajorEvent(id: '2', title: "Routine Checkup", status: "RESOLVED"),
      MajorEvent(id: '3', title: "Surgery Planning", status: "PLANNED"),
      MajorEvent(id: '4', title: "Emergency Response", status: "RESOLVED"),
    ];
  }

  //TODO: Replace with real API calls
  // Fetch Nodes for a specific Event
  Future<List<EventNode>> getNodesForEvent(String eventId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return [
      EventNode(
        id: 'n1',
        title: "Initial Consultation",
        date: "2023-10-01",
        details: "Patient presented with mild chest pain. Vital signs stable.",
        documentUrl: "path/to/consultation.pdf",
      ),
      EventNode(
        id: 'n2',
        title: "Lab Results Received",
        date: "2023-10-03",
        details: "Blood work shows elevated cholesterol. ECG normal.",
        documentUrl: "path/to/labs.pdf",
      ),
      EventNode(
        id: 'n3',
        title: "Follow-up Appointment",
        date: "2023-10-10",
        details: "Discussed lifestyle changes and prescribed statins.",
        documentUrl: "path/to/prescription.pdf",
      ),
    ];
  }
}
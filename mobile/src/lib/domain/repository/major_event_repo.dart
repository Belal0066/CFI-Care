import '../models/major_event.dart';
import '../models/event_node.dart';
import '../../data/services/datasources/api_service_booking.dart';

class MajorEventRepository {
  final ApiService apiService;

  MajorEventRepository(this.apiService);

  // Fetches FHIR EpisodeOfCare resources for the given patient.
  Future<List<MajorEvent>> getMajorEvents(String patientId) async {
    final raw = await apiService.fetchEpisodesOfCare(patientId);
    return raw
        .map((item) => MajorEvent.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  // Fetches history-graph nodes for one episode from the PostgreSQL graph store.
  Future<List<EventNode>> getNodesForEvent(
    String patientId,
    String eocId,
  ) async {
    final raw = await apiService.fetchGraphNodesForEpisode(patientId, eocId);
    return raw
        .map((item) => EventNode.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}

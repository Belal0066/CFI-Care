import 'package:flutter/material.dart';
import '../../database/db_helper.dart';
import '../../domain/models/major_event.dart';
import '../../domain/models/event_node.dart';
import '../../domain/repository/major_event_repo.dart';

class MajorEventProvider with ChangeNotifier {
  final MajorEventRepository repository;

  MajorEventProvider(this.repository);

  // --- STATE ---
  List<MajorEvent> _events = [];
  List<EventNode> _nodes = [];
  bool _isLoadingEvents = false;
  bool _isLoadingNodes = false;
  String? _eventsError;
  String? _nodesError;

  // --- GETTERS ---
  List<MajorEvent> get events => _events;
  List<EventNode> get nodes => _nodes;
  bool get isLoadingEvents => _isLoadingEvents;
  bool get isLoadingNodes => _isLoadingNodes;
  String? get eventsError => _eventsError;
  String? get nodesError => _nodesError;

  // --- ACTIONS ---

  Future<void> fetchEvents() async {
    final patientId = Session.fhirPatientId ?? Session.currentUserId;
    if (patientId == null || patientId.isEmpty) {
      _eventsError = 'No patient session';
      notifyListeners();
      return;
    }

    _isLoadingEvents = true;
    _eventsError = null;
    notifyListeners();

    try {
      _events = await repository.getMajorEvents(patientId);
    } catch (e) {
      _eventsError = e.toString();
      print('[MajorEventProvider] fetchEvents error: $e');
    } finally {
      _isLoadingEvents = false;
      notifyListeners();
    }
  }

  Future<void> fetchNodes(String eocId) async {
    final patientId = Session.fhirPatientId ?? Session.currentUserId;
    if (patientId == null || patientId.isEmpty) {
      _nodesError = 'No patient session';
      notifyListeners();
      return;
    }

    _isLoadingNodes = true;
    _nodes = [];
    _nodesError = null;
    notifyListeners();

    try {
      _nodes = await repository.getNodesForEvent(patientId, eocId);
    } catch (e) {
      _nodesError = e.toString();
      print('[MajorEventProvider] fetchNodes error: $e');
    } finally {
      _isLoadingNodes = false;
      notifyListeners();
    }
  }
}

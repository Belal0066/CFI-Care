import 'package:flutter/material.dart';
import '../../domain/models/major_event.dart';
import '../../domain/models/event_node.dart';
import '../../domain/repository/major_event_repo.dart';

class MajorEventProvider extends ChangeNotifier {
  final MajorEventRepository repository;

  MajorEventProvider(this.repository);

  // --- STATE ---
  List<MajorEvent> _events = [];
  List<EventNode> _nodes = [];
  bool _isLoadingEvents = false;
  bool _isLoadingNodes = false;

  // --- GETTERS ---
  List<MajorEvent> get events => _events;
  List<EventNode> get nodes => _nodes;
  bool get isLoadingEvents => _isLoadingEvents;
  bool get isLoadingNodes => _isLoadingNodes;

  // --- ACTIONS ---
  
  Future<void> fetchEvents() async {
    _isLoadingEvents = true;
    notifyListeners();
    try {
      _events = await repository.getMajorEvents();
    } catch (e) {
      print("Error fetching events: $e");
    } finally {
      _isLoadingEvents = false;
      notifyListeners();
    }
  }

  Future<void> fetchNodes(String eventId) async {
    _isLoadingNodes = true;
    _nodes = []; // Clear previous nodes
    notifyListeners();
    try {
      _nodes = await repository.getNodesForEvent(eventId);
    } catch (e) {
      print("Error fetching nodes: $e");
    } finally {
      _isLoadingNodes = false;
      notifyListeners();
    }
  }
}
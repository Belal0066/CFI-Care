import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:medflow/presentation/widgets/calendar.dart';
import 'package:medflow/domain/models/created_events.dart';
import 'package:medflow/presentation/widgets/new_event.dart';
import 'package:medflow/presentation/widgets/list_of_events.dart';
import '../../database/db_helper.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  Map<DateTime, List<Event>> _events = {};

  DateTime _selectedDate = DateTime.now();
  final DateFormat dateFormatter = DateFormat('yyyy-MM-dd');
  late ValueNotifier<List<Event>> selectedEvents;

  @override
  void initState() {
    super.initState();
    _selectedDate = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
    );
    selectedEvents = ValueNotifier([]);
    _loadEventsFromDatabase();
  }

  Future<void> _loadEventsFromDatabase() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('currentUserId');

    if (userId == null) return;

    final loaded = await DBHelper.getAllEventsForUser(userId);

    setState(() {
      _events = loaded;
      selectedEvents.value = _getEventsForDay(_selectedDate);
    });
  }

  List<Event> _getEventsForDay(DateTime day) {
    final normalizedDate = DateTime(day.year, day.month, day.day);
    return _events[normalizedDate] ?? [];
  }

  void _onDaySelected(DateTime selectedDay, DateTime focusedDay) {
    setState(() {
      _selectedDate = DateTime(
        selectedDay.year,
        selectedDay.month,
        selectedDay.day,
      );
      selectedEvents.value = _getEventsForDay(_selectedDate);
    });
  }

  Future<void> _removeEvent(Event oldEvent) async {
    // Safety check: only delete if ID exists
    if (oldEvent.id != null) {
      await DBHelper.deleteEvent(oldEvent.id!);
    }

    await _loadEventsFromDatabase();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text("Event deleted"),
          action: SnackBarAction(
            label: "Undo",
            onPressed: () async {
              final prefs = await SharedPreferences.getInstance();
              final userId = prefs.getString('currentUserId');
              if (userId != null) {
                await DBHelper.insertEvent(userId, oldEvent, _selectedDate);
                _loadEventsFromDatabase();
              }
            },
          ),
        ),
      );
    }
  }

  // Use the NewEvent widget (which now looks like your Add Document sheet)
  void _openAddEventOverlay() {
    showModalBottomSheet(
      isScrollControlled: true,
      useSafeArea: true, // Keeps it under the status bar
      context: context,
      builder: (contextOverlay) => NewEvent(
        getEventsForDay: _getEventsForDay,
        selectedDate: _selectedDate,
        refreshEvents: _loadEventsFromDatabase,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Schedule Screen"), centerTitle: true),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddEventOverlay, // Corrected function call
        child: const Icon(Icons.add),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Text(
                dateFormatter.format(_selectedDate),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            Calendar(
              getEventsForDay: _getEventsForDay,
              onDaySelected: _onDaySelected,
              selectedDate: _selectedDate,
            ),
            const SizedBox(height: 8),
            ListOfEvents(events: selectedEvents, removeEvent: _removeEvent),
          ],
        ),
      ),
    );
  }
}

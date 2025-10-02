import 'package:flutter/material.dart';
import 'package:medflow/widgets/calendar.dart';
import 'package:medflow/utils/schedule_utils.dart';
import 'package:medflow/models/created_events.dart';
import 'package:medflow/widgets/new_event.dart';

List<Event> _getEventsForDay(DateTime day) {
  return events[day] ?? [];
}

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  DateTime _selectedDate = DateTime.now();
  DateTime today = DateTime.now();

  @override
  void initState() {
    selectedEvents = ValueNotifier(_getEventsForDay(_selectedDate));
    super.initState();
  }

  void _onDaySelected(selectedDay, focusedDay) {
    setState(() {
      _selectedDate = selectedDay;
      selectedEvents.value = _getEventsForDay(_selectedDate);
    });
  }

  void _openAddExpenseOverlay() {
    showModalBottomSheet(
      context: context,
      builder: (contextOverlay) => NewEvent(
        getEventsForDay: _getEventsForDay,
        selectedDate: _selectedDate,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Schedule Screen",
          style: TextStyle(color: Colors.white),
        ),
        centerTitle: true,
        backgroundColor: Colors.blue,
        elevation: 40,
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddExpenseOverlay,
        child: Icon(Icons.add),
      ),
      body: Column(
        children: [
          Text(dateFormatter.format(_selectedDate)),
          Calendar(
            getEventsForDay: _getEventsForDay,
            onDaySelected: _onDaySelected,
            selectedDate: _selectedDate,
          ),
          SizedBox(height: 8),
          Expanded(
            child: ValueListenableBuilder<List<Event>>(
              valueListenable: selectedEvents,
              builder: (context, value, _) {
                return ListView.builder(
                  itemCount: value.length,
                  itemBuilder: (context, index) {
                    return Container(
                      margin: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        border: Border.all(),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ListTile(
                        onTap: () => print(" hi"),
                        title: Text(value[index].title),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

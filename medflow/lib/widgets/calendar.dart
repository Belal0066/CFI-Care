import 'package:flutter/material.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:medflow/models/created_events.dart';

class Calendar extends StatefulWidget {
  const Calendar({
    required this.getEventsForDay,
    required this.onDaySelected,
    required this.selectedDate,
    super.key,
  });

  final List<Event> Function(DateTime) getEventsForDay;
  final void Function(DateTime selectedDay, DateTime focusedDay) onDaySelected;
  final DateTime selectedDate;

  @override
  State<Calendar> createState() => _CalendarState();
}

class _CalendarState extends State<Calendar> {
  @override
  Widget build(BuildContext context) {
    return TableCalendar<Event>(
      eventLoader: widget.getEventsForDay,
      headerStyle: const HeaderStyle(
        formatButtonVisible: false,
        titleCentered: true,
      ),
      availableGestures: AvailableGestures.all,
      // Ensure predicate uses isSameDay to ignore time differences in highligting
      selectedDayPredicate: (day) => isSameDay(day, widget.selectedDate),
      onDaySelected: widget.onDaySelected,
      focusedDay: widget.selectedDate,
      firstDay: DateTime.utc(2010, 10, 16),
      lastDay: DateTime.utc(2030, 3, 14),
      calendarStyle: const CalendarStyle(
        markerDecoration: BoxDecoration(
          color: Colors.blue,
          shape: BoxShape.circle,
        ),
        selectedDecoration: BoxDecoration(
          color: Colors.blue, // Changed to match your app theme
          shape: BoxShape.circle,
        ),
        todayDecoration: BoxDecoration(
          color: Colors.blueAccent,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
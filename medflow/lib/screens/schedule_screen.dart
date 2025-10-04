import 'package:flutter/material.dart';
import 'package:medflow/widgets/calendar.dart';
import 'package:medflow/utils/schedule_utils.dart';
import 'package:medflow/models/created_events.dart';
import 'package:medflow/widgets/new_event.dart';
import 'package:medflow/widgets/list_of_events.dart';
// import 'package:flutter/src/foundation/change_notifier.dart'


List <Event> _getEventsForDay(DateTime day) {
  return events[day]?.value ?? [];
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
  // void _removeEvent(Event oldEvent){
  //   final eventIndex = events[_selectedDate]?.value.indexOf(oldEvent);
  //   final dayEvents = events[_selectedDate];
  //   if(dayEvents == null) {
  //     return;
  //   }
  //   ScaffoldMessenger.of(context).clearSnackBars();
  //   dayEvents.value.remove(oldEvent);
  //   // dayEvents.notifyListeners();
  //   dayEvents.value = List<Event>.from(dayEvents.value);
  //   ScaffoldMessenger.of(context).showSnackBar(
  //       SnackBar(
  //         duration: Duration(seconds: 3),
  //         content: Text("Expense Deleted"),
  //         action: SnackBarAction(
  //           label: "Undo",
  //           onPressed: (){
  //             setState(() {
  //             if (eventIndex != null) {
  //               dayEvents.value.insert(eventIndex, oldEvent);
  //               // dayEvents.value = List<Event>.from(dayEvents.value);
  //             }
  //             });
  //           }
  //         ),
  //       ),
  //     );
  // }


  void _removeEvent(Event oldEvent){
    final dayEvents = events[_selectedDate];
    if (dayEvents == null) {
      return;
    }

    final eventIndex = dayEvents.value.indexOf(oldEvent);
    if (eventIndex == -1) {
      return;
    }

    // clear previous snackbars and remove item immediately so Dismissible is removed from tree
    ScaffoldMessenger.of(context).clearSnackBars();
    dayEvents.value.removeAt(eventIndex);
    dayEvents.value = List<Event>.from(dayEvents.value); // notify listeners

    // update the currently displayed list (selectedEvents) if it's showing this date
    selectedEvents.value = List.from(_getEventsForDay(_selectedDate));

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 3),
        content: const Text("Event Deleted"),
        action: SnackBarAction(
          label: "Undo",
          onPressed: () {
            // re-insert at previous index and notify listeners so UI returns the card
            dayEvents.value.insert(eventIndex, oldEvent);
            dayEvents.value = List<Event>.from(dayEvents.value);
            selectedEvents.value = List.from(_getEventsForDay(_selectedDate));
          },
        ),
      ),
    );
  }

  void _onDaySelected(selectedDay, focusedDay) {
    setState(() {
      _selectedDate = selectedDay;
      selectedEvents.value = _getEventsForDay(_selectedDate);
    });
  }

  void _openAddExpenseOverlay() {
    showModalBottomSheet(
      isScrollControlled: true,
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
          // style: TextStyle(color: Colors.white),
        ),
        centerTitle: true,
        // backgroundColor: Colors.blue,
        // elevation: 40,
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
            child:ListOfEvents(events: selectedEvents,removeEvent: _removeEvent,) ,
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:medflow/models/created_events.dart';
import 'package:medflow/utils/schedule_utils.dart';

class NewEvent extends StatefulWidget {
  const NewEvent({
    required this.getEventsForDay,
    required this.selectedDate,
    super.key,
  });
  final List<Event> Function(DateTime) getEventsForDay;
  final DateTime selectedDate;
  @override
  State<NewEvent> createState() {
    return _NewEventState();
  }
}

class _NewEventState extends State<NewEvent> {
  final _titleController = TextEditingController();
  final _detailsController = TextEditingController();
  TimeOfDay? _selectedTime;
  EventCategoryEnum? _selectedEventCategory;
  SpecialityCategoryEnum? _selectedSpecialityCategory;
  void _timePicker() async {
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: 00, minute: 00),
    );
    setState(() {
      _selectedTime = pickedTime;
    });
  }

  @override
  void dispose() {
    _detailsController.dispose();
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsetsGeometry.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _titleController,
            maxLength: 50,
            decoration: InputDecoration(label: Text("Title")),
            keyboardType: TextInputType.text,
          ),
          TextField(
            controller: _detailsController,
            decoration: InputDecoration(label: Text("Details")),
            keyboardType: TextInputType.text,
          ),
          SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                _selectedTime == null
                    ? "Select Time of Event"
                    : _selectedTime!.format(context),
              ),
              IconButton(
                onPressed: _timePicker,
                icon: Icon(Icons.timer_outlined),
              ),
              Spacer(),
              DropdownButton(
                menuMaxHeight: 150,
                hint: Text("Type of Event"),
                value: _selectedEventCategory,
                items: EventCategoryEnum.values
                    .map(
                      (category) => DropdownMenuItem(
                        value: category,
                        child: Text(category.name.toUpperCase()),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  setState(() {
                    if (value == null) {
                      return;
                    }
                    _selectedEventCategory = value;
                  });
                },
              ),
            ],
          ),
          SizedBox(height: 16),
          DropdownButton(
            menuMaxHeight: 150,
            hint: Text("Speciality"),
            value: _selectedSpecialityCategory,
            items: SpecialityCategoryEnum.values
                .map(
                  (category) => DropdownMenuItem(
                    value: category,
                    child: Text(category.name.toUpperCase()),
                  ),
                )
                .toList(),
            onChanged: (value) {
              setState(() {
                if (value == null) {
                  return;
                }
                _selectedSpecialityCategory = value;
              });
            },
          ),
          SizedBox(height: 16),
          Row(
            children: [
              Spacer(),
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                },
                child: Text("Cancel"),
              ),
              SizedBox(width: 10),
              ElevatedButton(
                onPressed: () {
                  final newEvent = Event(_titleController.text);

                  if (events[widget.selectedDate] != null) {
                    events[widget.selectedDate]!.add(newEvent);
                  } else {
                    events[widget.selectedDate] = [newEvent];
                  }

                  selectedEvents.value = List.from(
                    widget.getEventsForDay(widget.selectedDate),
                  );

                  Navigator.of(context).pop();
                },
                child: Text("Save Event"),
              ),
              SizedBox(width: 10),
            ],
          ),
        ],
      ),
    );
  }
}

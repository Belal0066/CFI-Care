import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:medflow/models/created_events.dart';


//store events created
Map<DateTime, List<Event>> events = {};

// DropDownMenus
enum EventCategoryEnum { lab, scan, appointment }
enum SpecialityCategoryEnum { cardiology, neurology, hematology }

// Format date in MM/DD/YEAR
var dateFormatter = DateFormat.yMd();

late final ValueNotifier<List<Event>> selectedEvents;
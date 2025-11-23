import 'package:intl/intl.dart';
import 'package:medflow/models/created_events.dart';
import 'package:flutter/foundation.dart';


//store events created
Map<DateTime, ValueNotifier<List<Event>>> events ={};

// DropDownMenus
enum TypeOfEventEnum { lab, scan, appointment,other}
enum SpecialityEventEnum { cardiology, neurology, hematology,other }



// Format date in MM/DD/YEAR
var dateFormatter = DateFormat.yMd();

late ValueNotifier<List<Event>> selectedEvents;
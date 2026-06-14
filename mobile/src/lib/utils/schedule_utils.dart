import 'package:intl/intl.dart';
import 'package:medflow/domain/models/created_events.dart';
import 'package:flutter/foundation.dart';



//store events created
Map<DateTime, ValueNotifier<List<Event>>> events ={};





// Format date in MM/DD/YEAR
var dateFormatter = DateFormat.yMd();

late ValueNotifier<List<Event>> selectedEvents;
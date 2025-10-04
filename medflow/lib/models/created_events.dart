import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'package:iconify_flutter_plus/iconify_flutter_plus.dart';
import 'package:iconify_flutter_plus/icons/mdi.dart';
import 'package:medflow/utils/schedule_utils.dart';

final uuid = Uuid();




// final dateFormatter = DateFormat.yMd();
final typeOfEventIcons = {
  TypeOfEventEnum.lab: Icons.science,
  // TypeOfEventEnum.scan: Iconify(Mdi.radiation),
  TypeOfEventEnum.appointment: Icons.movie,
  TypeOfEventEnum.other: Icons.category,
};

final SpecialityEventIcons = {
  SpecialityEventEnum.cardiology: Icons.science,
  SpecialityEventEnum.neurology: Iconify(Mdi.radiation),
  SpecialityEventEnum.hematology: Icons.movie,
  SpecialityEventEnum.other: Icons.category,
};

class Event {
  Event({
    required this.title,
    required this.details,
    required this.time,
    required this.selectedTypeOfEventEnum,
    required this.selectedSpecialityEnum,
  }) : id = uuid.v4();
  final String id;
  final String title ;
  final String? details;
  final TimeOfDay time;
  final Enum? selectedTypeOfEventEnum;
  final Enum? selectedSpecialityEnum;

  // String get formattedDate {
  //   return dateFormatter.format(date);
  // }
}

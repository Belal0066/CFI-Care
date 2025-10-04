import 'package:medflow/models/created_events.dart';
import 'package:flutter/material.dart';

class ItemEvent extends StatelessWidget {
  const ItemEvent(this.eventItem, {super.key});
  final Event eventItem;
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: EdgeInsetsGeometry.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          children: [
            Text(eventItem.title ),
            SizedBox(height: 4),
            Row(
              children: [
                Text(eventItem.details?? ''),
                Spacer(),
                Row(
                  children: [
                    Icon(typeOfEventIcons[eventItem.selectedTypeOfEventEnum]),
                    SizedBox(width: 8,),
                    Text(eventItem.time.format(context)),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

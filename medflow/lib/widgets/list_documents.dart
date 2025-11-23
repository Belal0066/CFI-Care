import 'package:medflow/models/created_events.dart';
import 'package:medflow/widgets/item_event.dart';
import 'package:flutter/material.dart';

class ListOfEvents extends StatelessWidget {
  const ListOfEvents({
    super.key,
    required this.events,
    required this.removeEvent,
  });
  final ValueNotifier<List<Event>>? events;
  final Function(Event expense) removeEvent;
  @override
  Widget build(BuildContext context) {
    if (events == null) {
      return Text("List is empty");
    }
    // return ValueListenableBuilder(
    //   valueListenable: events!,
    //   builder: (context, value, _){
    //     if(value.isEmpty){
    //       return Text("No Events Found");
    //     }
    //     return ListView.builder(
    //       itemCount: events?.value.length ?? 0,
    //       itemBuilder: (context, index) => Dismissible(
    //         key: ValueKey(events!.value[index]),
    //         child: ItemEvent(events!.value[index]),
    //         onDismissed: (direction) {
    //           removeEvent(events!.value[index]);
    //         },
    //       ),
    //     );
    //   },
    // );

    return ValueListenableBuilder<List<Event>>(
      valueListenable: events!,
      builder: (context, value, _) {
        if (value.isEmpty) {
          return const Center(child: Text("No Events Found"));
        }
        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: value.length,
          itemBuilder: (context, index) {
            final event = value[index]; // capture the exact event instance
            return Dismissible(
              key: ValueKey(event),
              child: ItemEvent(event),
              onDismissed: (direction) {
                // call parent handler with the captured event instance
                removeEvent(event);
              },
            );
          },
        );
      },
    );
  }
}

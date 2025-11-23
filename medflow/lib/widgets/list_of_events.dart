import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart'; 
import '../models/created_events.dart';

class ListOfEvents extends StatelessWidget {
  final ValueNotifier<List<Event>> events;
  final Function(Event) removeEvent;

  const ListOfEvents({
    super.key,
    required this.events,
    required this.removeEvent,
  });

  void _showEventDetails(BuildContext context, Event event) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.5,
          minChildSize: 0.3,
          maxChildSize: 0.9,
          builder: (context, scrollController) {
            return SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Handle Bar
                  Center(
                    child: Container(
                      width: 40, height: 4, margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  
                  Text(event.title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      Chip(label: Text(event.selectedTypeOfEventEnum.name.toUpperCase())),
                      Chip(label: Text(event.selectedSpecialityEnum.name.toUpperCase())),
                    ],
                  ),
                  const Divider(),
                  
                  ListTile(
                    leading: const Icon(Icons.access_time),
                    title: const Text("Time"),
                    subtitle: Text(event.time.format(context)),
                  ),
                  
                  if (event.summary.isNotEmpty) ...[
                    ListTile(
                      leading: const Icon(Icons.short_text),
                      title: const Text("Summary"),
                      subtitle: Text(event.summary),
                    ),
                  ],
                  
                  if (event.details.isNotEmpty) ...[
                    ListTile(
                      leading: const Icon(Icons.notes),
                      title: const Text("Details"),
                      subtitle: Text(event.details),
                    ),
                  ],
                  
                  if (event.attachmentPath != null) ...[
                    const Divider(),
                    const Text("Attachment", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 8),
                    _buildAttachmentView(context, event.attachmentPath!),
                  ],
                  const SizedBox(height: 20),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildAttachmentView(BuildContext context, String path) {
    final file = File(path);
    final isImage = path.toLowerCase().endsWith('.jpg') || 
                    path.toLowerCase().endsWith('.png') || 
                    path.toLowerCase().endsWith('.jpeg');

    return InkWell(
      onTap: () async {
        if (await file.exists()) {
          final result = await OpenFilex.open(path);
          if (result.type != ResultType.done) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text("Could not open file: ${result.message}")),
              );
            }
          }
        } else {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text("File not found on device")),
            );
          }
        }
      },
      child: isImage && file.existsSync() 
        ? ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(file, height: 200, width: double.infinity, fit: BoxFit.cover),
          ) 
        : Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(8),
              color: Colors.blue.shade50,
            ),
            child: Row(
              children: [
                const Icon(Icons.attach_file, color: Colors.blue),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    path.split('/').last,
                    style: const TextStyle(fontWeight: FontWeight.w500, color: Colors.blue),
                  ),
                ),
                const Icon(Icons.open_in_new, size: 18, color: Colors.grey),
              ],
            ),
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<List<Event>>(
      valueListenable: events,
      builder: (context, eventList, child) {
        if (eventList.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16.0),
            child: Center(child: Text("No events for this day")),
          );
        }
        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: eventList.length,
          itemBuilder: (ctx, index) {
            final event = eventList[index];
            
            // --- ADDED DISMISSIBLE HERE ---
            return Dismissible(
              key: ValueKey(event.id), // Unique key required
              direction: DismissDirection.endToStart, // Swipe right to left
              onDismissed: (direction) {
                // Call the parent remove function
                removeEvent(event);
              },
              // Red background with delete icon
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: 20),
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(12), // Matches card shape
                ),
                child: const Icon(Icons.delete, color: Colors.white, size: 30),
              ),
              child: Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.event)),
                  title: Text(event.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    "${event.time.format(context)}\n${event.summary.isNotEmpty ? event.summary : event.details}",
                    maxLines: 2, 
                    overflow: TextOverflow.ellipsis,
                  ),
                  isThreeLine: true,
                  onTap: () => _showEventDetails(context, event),
                  // Kept the button as an alternative option
                  trailing: IconButton(
                    icon: const Icon(Icons.delete, color: Colors.red),
                    onPressed: () => removeEvent(event),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/models/major_event.dart';
import '../viewmodels/major_event_provider.dart';
import 'NodeDetailsScreen.dart';

class EventNodesScreen extends StatefulWidget {
  final MajorEvent event;

  const EventNodesScreen({super.key, required this.event});

  @override
  State<EventNodesScreen> createState() => _EventNodesScreenState();
}

class _EventNodesScreenState extends State<EventNodesScreen> {
  
  @override
  void initState() {
    super.initState();
    // Fetch nodes when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MajorEventProvider>().fetchNodes(widget.event.id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<MajorEventProvider>();

    return Scaffold(
      appBar: AppBar(title: Text(widget.event.title)),
      body: provider.isLoadingNodes
          ? const Center(child: CircularProgressIndicator())
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: provider.nodes.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final node = provider.nodes[index];
                return Card(
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: ListTile(
                    leading: const Icon(Icons.circle, size: 12, color: Colors.blue), // Bullet Point
                    title: Text(node.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(node.date),
                    trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => NodeDetailScreen(node: node)),
                      );
                    },
                  ),
                );
              },
            ),
    );
  }
}
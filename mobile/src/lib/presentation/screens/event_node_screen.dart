import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/models/major_event.dart';
import '../../domain/models/event_node.dart';
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MajorEventProvider>().fetchNodes(widget.event.id);
    });
  }

  Color _categoryColor(String category) {
    switch (category.toLowerCase()) {
      case 'consultation':
        return Colors.blue;
      case 'lab':
        return Colors.purple;
      case 'imaging':
        return Colors.teal;
      case 'prescription':
        return Colors.green;
      case 'followup':
        return Colors.orange;
      case 'allergy':
        return Colors.red;
      case 'aisuggestion':
        return Colors.indigo;
      case 'historical':
        return Colors.brown;
      default:
        return Colors.grey;
    }
  }

  IconData _categoryIcon(String category) {
    switch (category.toLowerCase()) {
      case 'consultation':
        return Icons.medical_services_outlined;
      case 'lab':
        return Icons.science_outlined;
      case 'imaging':
        return Icons.image_outlined;
      case 'prescription':
        return Icons.medication_outlined;
      case 'followup':
        return Icons.event_repeat_outlined;
      case 'allergy':
        return Icons.warning_amber_outlined;
      case 'aisuggestion':
        return Icons.auto_awesome_outlined;
      case 'historical':
        return Icons.history_outlined;
      default:
        return Icons.circle_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<MajorEventProvider>();

    return Scaffold(
      appBar: AppBar(title: Text(widget.event.title)),
      body: provider.isLoadingNodes
          ? const Center(child: CircularProgressIndicator())
          : provider.nodesError != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 8),
                      Text('Failed to load events', style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: 4),
                      TextButton(
                        onPressed: () => context.read<MajorEventProvider>().fetchNodes(widget.event.id),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : provider.nodes.isEmpty
                  ? const Center(child: Text('No events found for this episode.'))
                  : _buildTimeline(context, provider.nodes),
    );
  }

  Widget _buildTimeline(BuildContext context, List<EventNode> nodes) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: nodes.length,
      itemBuilder: (context, index) {
        final node = nodes[index];
        final color = _categoryColor(node.category);
        final isLast = index == nodes.length - 1;

        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Timeline column
              SizedBox(
                width: 40,
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: color.withValues(alpha: 0.15),
                      child: Icon(_categoryIcon(node.category), size: 16, color: color),
                    ),
                    if (!isLast)
                      Expanded(
                        child: Container(
                          width: 2,
                          color: Colors.grey.shade300,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              // Card
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                  child: Card(
                    elevation: 2,
                    margin: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => NodeDetailScreen(node: node)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    node.title,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  ),
                                ),
                                if (node.category.isNotEmpty)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: color.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      node.category,
                                      style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                              ],
                            ),
                            if (node.date.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(node.date, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                            ],
                            if (node.details.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                node.details,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13, color: Colors.black87),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

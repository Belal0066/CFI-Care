import 'package:flutter/material.dart';
import '../../domain/models/event_node.dart';

class NodeDetailScreen extends StatelessWidget {
  final EventNode node;

  const NodeDetailScreen({super.key, required this.node});

  Color _priorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  Color _normalityColor(String normality) {
    switch (normality.toLowerCase()) {
      case 'abnormal':
        return Colors.red;
      case 'normal':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Event Details')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title
            Text(
              node.title,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),

            // Date
            if (node.date.isNotEmpty)
              Text(
                node.date,
                style: TextStyle(color: Colors.grey[600], fontSize: 15),
              ),

            const SizedBox(height: 16),

            // Metadata chips row
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (node.category.isNotEmpty)
                  _Chip(label: node.category, color: Colors.blue),
                if (node.priority.isNotEmpty)
                  _Chip(
                    label: node.priority,
                    color: _priorityColor(node.priority),
                    icon: Icons.flag_outlined,
                  ),
                if (node.normality.isNotEmpty)
                  _Chip(
                    label: node.normality,
                    color: _normalityColor(node.normality),
                    icon: node.normality.toLowerCase() == 'normal'
                        ? Icons.check_circle_outline
                        : Icons.warning_amber_outlined,
                  ),
              ],
            ),

            const Divider(height: 32),

            // Description
            if (node.details.isNotEmpty) ...[
              const Text(
                'Description',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text(
                node.details,
                style: const TextStyle(fontSize: 15, height: 1.5),
              ),
              const SizedBox(height: 24),
            ],
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const _Chip({required this.label, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

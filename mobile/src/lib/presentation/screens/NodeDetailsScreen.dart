import 'package:flutter/material.dart';
import '../../domain/models/event_node.dart';

class NodeDetailScreen extends StatelessWidget {
  final EventNode node;

  const NodeDetailScreen({super.key, required this.node});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Details")),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(node.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(node.date, style: TextStyle(color: Colors.grey[600], fontSize: 16)),
            const Divider(height: 30),
            
            const Text("Description:", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            Text(node.details, style: const TextStyle(fontSize: 16, height: 1.5)),
            
            const Spacer(),
            
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  // Logic to open PDF/Image (using OpenFilex or similar)
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text("Opening ${node.documentUrl}...")),
                  );
                },
                icon: const Icon(Icons.description),
                label: const Text("View Document"),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
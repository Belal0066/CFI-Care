import 'package:flutter/material.dart';
import '../../domain/models/vitals.dart';

class VitalCard extends StatelessWidget {
  final VitalSign vital;

  const VitalCard({super.key, required this.vital});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150, // Fixed width for horizontal scrolling
      margin: const EdgeInsets.only(right: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Header: Icon + Name
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: vital.color.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(vital.icon, color: vital.color, size: 20),
              ),
              const Spacer(),
              // Optional: Add a "Sync" icon or status dot here
              const Icon(Icons.watch, size: 16, color: Colors.grey),
            ],
          ),
          
          const SizedBox(height: 12),

          // Value
          RichText(
            text: TextSpan(
              children: [
                TextSpan(
                  text: vital.value,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                TextSpan(
                  text: ' ${vital.unit}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.grey,
                  ),
                ),
              ],
            ),
          ),

          // Footer: Time
          Text(
            _getTimeAgo(vital.lastUpdated),
            style: TextStyle(fontSize: 10, color: Colors.grey[400]),
          ),
        ],
      ),
    );
  }

  String _getTimeAgo(DateTime time) {
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return "Just now";
    if (diff.inMinutes < 60) return "${diff.inMinutes} min ago";
    return "${diff.inHours} hr ago";
  }
}
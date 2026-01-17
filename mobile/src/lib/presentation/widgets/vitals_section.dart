import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../viewmodels/vitals_provider.dart';
import 'vitals_card.dart';

class VitalsSection extends StatefulWidget {
  const VitalsSection({super.key});

  @override
  State<VitalsSection> createState() => _VitalsSectionState();
}

class _VitalsSectionState extends State<VitalsSection> {
  @override
  void initState() {
    super.initState();
    // Load data when widget appears
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<VitalsProvider>().loadVitals();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<VitalsProvider>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "My Vitals",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, color: Colors.blue),
                onPressed: () => context.read<VitalsProvider>().loadVitals(),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 140, // Height of the cards area
          child: provider.isLoading
              ? const Center(child: CircularProgressIndicator())
              : ListView.builder(
                  padding: const EdgeInsets.only(left: 16),
                  scrollDirection: Axis.horizontal,
                  itemCount: provider.vitals.length,
                  itemBuilder: (ctx, index) {
                    return VitalCard(vital: provider.vitals[index]);
                  },
                ),
        ),
      ],
    );
  }
}
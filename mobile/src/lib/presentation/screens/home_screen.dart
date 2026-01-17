import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:medflow/utils/themes/theme.dart';
import '../widgets/vitals_section.dart';
import '../viewmodels/major_event_provider.dart';
import 'event_node_screen.dart'; 

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MajorEventProvider>().fetchEvents();
    });
  }

  Color getStatusColor(String status) {
    switch (status) {
      case "RESOLVED": return Colors.green;
      case "CONFLICT": return Colors.orange;
      case "PLANNED": return Colors.purpleAccent;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    // 1. THIS WAS MISSING: Listen to the provider for changes
    final provider = context.watch<MajorEventProvider>();

    return MaterialApp(
      theme: patientTheme,
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        extendBodyBehindAppBar: false,
        body: CustomScrollView(
          slivers: [
            // --- SCROLLABLE APP BAR ---
            const SliverAppBar(
              backgroundColor: Colors.transparent,
              elevation: 0,
              pinned: false,
              floating: true,
              snap: true,
              title: Text("Dashboard", style: TextStyle(color: Colors.black)),
            ),

            // --- MAIN CONTENT ---
            SliverToBoxAdapter(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      "Major Events",
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),

                    // 2. CHECK LOADING STATE
                    if (provider.isLoadingEvents)
                      const Center(child: CircularProgressIndicator())
                    else
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: provider.events.length,
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 3 / 2,
                        ),
                        itemBuilder: (context, index) {
                          final event = provider.events[index];
                          final color = getStatusColor(event.status);

                          return Card(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            elevation: 3,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: () {
                                // Navigate to Details
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => EventNodesScreen(event: event),
                                  ),
                                );
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    // Title
                                    Text(
                                      event.title,
                                      textAlign: TextAlign.center,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 10),

                                    // Status Chip
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: color.withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        event.status,
                                        style: TextStyle(
                                          color: color,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),

                    const SizedBox(height: 25),

                    // --- VITALS SECTION ---
                    const VitalsSection(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
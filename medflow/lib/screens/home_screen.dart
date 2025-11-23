import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:medflow/widgets/theme.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final List<Map<String, String>> majorEvents = [
    {"title": "Cardiac Workup", "status": "CONFLICT"},
    {"title": "Cardiac Workup", "status": "RESOLVED"},
    {"title": "Cardiac Workup", "status": "PLANNED"},
  ];

  final List<Map<String, dynamic>> vitals = [
    {
      "name": "Heart Rate (bpm)",
      "values": [75, 80, 78, 82, 76, 85, 79],
      "color": Colors.redAccent
    },
    {
      "name": "Oxygen Level (%)",
      "values": [98, 97, 99, 96, 97, 98, 99],
      "color": Colors.blueAccent
    },
    {
      "name": "Body Temp (°C)",
      "values": [36.5, 36.6, 36.7, 36.8, 36.7, 36.6, 36.7],
      "color": Colors.orangeAccent
    },
  ];

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: patientTheme,
      debugShowCheckedModeBanner: false,
      // theme: ThemeData.dark().copyWith(
      //   scaffoldBackgroundColor: const Color(0xFF0D1B2A),
      //   appBarTheme: const AppBarTheme(
      //     backgroundColor: Color(0xFF1B263B),
      //     centerTitle: true,
      //     titleTextStyle: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
      //   ),
      //   cardColor: const Color(0xFF1E2A3A),
      //   textTheme: const TextTheme(
      //     bodyMedium: TextStyle(color: Colors.white70),
      //   ),
      // ),
      home: Scaffold(
        appBar: AppBar(
          title: const Text("Dashboard"),
          centerTitle: true,
        ),
        body: SingleChildScrollView(
  padding: const EdgeInsets.all(16),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      // ---------------- Major Events ----------------
      const Text(
        "Major Events",
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 10),

      GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: majorEvents.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 3 / 2,
        ),
        itemBuilder: (context, index) {
          final event = majorEvents[index];
          final color = event["status"] == "RESOLVED"
              ? Colors.green
              : event["status"] == "CONFLICT"
                  ? Colors.orange
                  : Colors.purpleAccent;
          return Card(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: 3,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    event["title"]!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 16),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      event["status"]!,
                      style: TextStyle(color: color),
                    ),
                  )
                ],
              ),
            ),
          );
        },
      ),

      const SizedBox(height: 25),
      const Text(
        "Patient Vitals",
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 10),

      // Vitals List
      ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: vitals.length,
        itemBuilder: (context, index) {
          final vital = vitals[index];
          return Card(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            margin: const EdgeInsets.symmetric(vertical: 10),
            elevation: 3,
            child: Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    vital["name"],
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 120,
                    child: LineChart(
                      LineChartData(
                        gridData: FlGridData(show: false),
                        titlesData: FlTitlesData(show: false),
                        borderData: FlBorderData(show: false),
                        lineBarsData: [
                          LineChartBarData(
                            spots: List.generate(
                              vital["values"].length,
                              (i) => FlSpot(
                                  i.toDouble(), vital["values"][i].toDouble()),
                            ),
                            isCurved: true,
                            color: vital["color"],
                            barWidth: 3,
                            dotData: const FlDotData(show: false),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ],
  ),
),
      ),
    );
  }
}

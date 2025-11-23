import 'package:flutter/material.dart';
import 'package:medflow/screens/documents_screen.dart';
import 'package:medflow/screens/my_profile.dart';
import 'package:medflow/screens/schedule_screen.dart';
import 'package:medflow/screens/home_screen.dart';

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  static GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  int selectedIndex = 0;
  // Add your pages here
  final List<Widget> pages = [
    //Comment out the pages when u add them
    const HomeScreen(),
    const ScheduleScreen(),
    // const Settings(),
    const MedicalDocsPage(),
    const MyProfile(),
    // const SensorMonitoring(),
    // const AnalyticsPage(),
  ];
  @override
  Widget build(BuildContext context) {
    return
    // debugShowCheckedModeBanner: false,
    // theme: ThemeData(
    //   primarySwatch: Colors.blue,
    // ),
    Scaffold(
      body: pages[selectedIndex],
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: Colors.grey.shade400, width: 1.0),
          ),
        ),
        child: NavigationBar(
          selectedIndex: selectedIndex,
          onDestinationSelected: (int index) {
            setState(() {
              selectedIndex = index;
            });
          },
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: "Home",
            ),
            NavigationDestination(
              icon: Icon(Icons.calendar_month_outlined),
              selectedIcon: Icon(Icons.calendar_month),
              label: 'Schedule',
            ),
            // NavigationDestination(
            //   icon: Icon(Icons.settings_outlined),
            //   selectedIcon: Icon(Icons.settings),
            //   label: 'Settings',
            // ),
            NavigationDestination(
              icon: Icon(Icons.document_scanner_outlined),
              selectedIcon: Icon(Icons.document_scanner),
              label: 'Document',
            ),
            // NavigationDestination(icon: Icon(Icons.folder_outlined), label: "Documents", selectedIcon: Icon(Icons.folder)),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'My Profile',
            ),

            // NavigationDestination(
            //   icon: Icon(Icons.sensors_outlined),
            //   selectedIcon: Icon(Icons.sensors),
            //   label: 'Sensors',
            // ),

            // NavigationDestination(
            //   icon: Icon(Icons.analytics_outlined),
            //   selectedIcon: Icon(Icons.analytics),
            //   label: 'Analytics',
            // ),
          ],
        ),
      ),
    );
  }
}

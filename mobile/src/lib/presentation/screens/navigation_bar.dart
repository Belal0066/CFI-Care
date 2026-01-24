import 'package:flutter/material.dart';
import 'package:medflow/utils/themes/theme.dart';
import 'package:medflow/presentation/screens/documents_screen.dart';
import 'package:medflow/presentation/screens/my_profile.dart';
import 'package:medflow/presentation/screens/home_screen.dart';
import 'package:medflow/presentation/screens/search_doctor_speciality.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_core/firebase_core.dart';
import '../../utils/themes/theme.dart';
import '../screens/home_screen.dart';
import '../screens/search_doctor_speciality.dart';
import '../screens/documents_screen.dart';
import '../screens/my_profile.dart';



class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  // --- VARIABLES FOR NAVIGATION ---
  int selectedIndex = 0;
  late PageController _pageController;

  @override
  void initState() {
    super.initState();
    
    // A. Setup Navigation Controller
    _pageController = PageController(initialPage: selectedIndex);

    // B. Setup Firebase Notifications
    setupInteractedMessage();
  }

  // --- FIREBASE LOGIC ---
  Future<void> setupInteractedMessage() async {
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    // 1. Request Permission
    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');
    }

    // 2. Get Token (Check console for this!)
    String? token = await messaging.getToken();
    print("FCM Token: $token");

    // 3. Listen for Foreground Messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Got a message whilst in the foreground!');
      if (message.notification != null) {
        print('Message body: ${message.notification!.body}');
        
        // Optional: Show a Snackbar when a message arrives while app is open
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message.notification!.title ?? "New Message"),
            backgroundColor: Colors.blue,
          ),
        );
      }
    });
    
    // 4. Handle Notification Taps (Optional Navigation Logic)
    // If the app was terminated and opened by a notification
    RemoteMessage? initialMessage = await messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleMessage(initialMessage);
    }

    // If the app was in background and opened by a notification
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessage);
  }

  void _handleMessage(RemoteMessage message) {
    // Navigate to specific screen if needed
    if (message.data['type'] == 'chat') {
       // Example: Navigator.pushNamed(context, '/chat');
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  // --- BUILD UI (Your existing PageView) ---
  @override
  Widget build(BuildContext context) {
    return Theme(
      data: patientTheme, // Ensure this variable exists in your theme file
      child: Scaffold(
        body: PageView(
          controller: _pageController,
          onPageChanged: (index) {
            setState(() => selectedIndex = index);
          },
          children: const [
            HomeScreen(),
            // ScheduleScreen(), // Uncomment when ready
            SearchDoctorScreen(),
            MedicalDocsPage(),
            MyProfile(),
          ],
        ),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Colors.grey.shade300)),
          ),
          child: BottomNavigationBar(
            currentIndex: selectedIndex,
            onTap: (index) {
              setState(() => selectedIndex = index);
              _pageController.animateToPage(
                index,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeInOut,
              );
            },
            type: BottomNavigationBarType.fixed,
            elevation: 0,
            selectedItemColor: const Color.fromARGB(255, 25, 136, 210),
            unselectedItemColor: Colors.grey.shade600,
            items: const [
              BottomNavigationBarItem(
                  icon: Icon(Icons.home_outlined),
                  activeIcon: Icon(Icons.home),
                  label: "Home"),
              BottomNavigationBarItem(
                  icon: Icon(Icons.calendar_month_outlined),
                  activeIcon: Icon(Icons.calendar_month),
                  label: 'Activity'),
              BottomNavigationBarItem(
                  icon: Icon(Icons.description_outlined),
                  activeIcon: Icon(Icons.description),
                  label: 'Documents'),
              BottomNavigationBarItem(
                  icon: Icon(Icons.person_outline),
                  activeIcon: Icon(Icons.person),
                  label: 'Profile'),
            ],
          ),
        ),
      ),
    );
  }
}
import 'package:flutter/material.dart';
import 'package:medflow/utils/themes/theme.dart';
import 'package:medflow/presentation/screens/documents_screen.dart';
import 'package:medflow/presentation/screens/my_profile.dart';
import 'package:medflow/presentation/screens/home_screen.dart';
import 'package:medflow/presentation/screens/search_doctor_speciality.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import '../viewmodels/access_grant_provider.dart';
// import 'package:firebase_core/firebase_core.dart';
// import '../../utils/themes/theme.dart';
// import '../screens/home_screen.dart';
// import '../screens/search_doctor_speciality.dart';
// import '../screens/documents_screen.dart';
// import '../screens/my_profile.dart';



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

    // Request Permission
    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');
    }

    // Get Token 
    String? token = await messaging.getToken();
    print("FCM Token: $token");

    // Listen for Foreground Messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      if (!mounted) return;
      if (message.data['type'] == 'grant_request') {
        context.read<AccessGrantProvider>().fetchPendingGrants();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('A doctor is requesting access to your data'),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 4),
          ),
        );
      } else if (message.notification != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message.notification!.title ?? 'New Message'),
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
    if (message.data['type'] == 'chat') {
      // Example: Navigator.pushNamed(context, '/chat');
    }
    if (message.data['type'] == 'grant_request') {
      if (mounted) context.read<AccessGrantProvider>().fetchPendingGrants();
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
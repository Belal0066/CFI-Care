import 'package:flutter/material.dart';
import 'package:medflow/utils/themes/theme.dart';
import 'package:medflow/presentation/screens/documents_screen.dart';
import 'package:medflow/presentation/screens/my_profile.dart';
import 'package:medflow/presentation/screens/home_screen.dart';
import 'package:medflow/presentation/screens/search_doctor_speciality.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import '../viewmodels/access_grant_provider.dart';
import '../viewmodels/family_access_provider.dart';
import '../viewmodels/proxy_session_provider.dart';
import '../../data/services/datasources/api_service_booking.dart';

class MyApp extends StatefulWidget {
  final ApiService apiService;
  const MyApp({super.key, required this.apiService});

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

    // TODO: Send this FCM token to the backend so the server can push
    // notifications to this device when a doctor requests access.
    //
    // How to do it:
    //   1. After the user logs in and this token is available, POST it to a
    //      backend endpoint, e.g.:
    //
    //        await apiService.postData(
    //          endpoint: '/users/fcm-token',
    //          data: {'fcmToken': token},
    //        );
    //
    //   2. The backend should store it in Redis (or the DB) keyed by patientId:
    //        redis.set(`fcm_token:${patientId}`, token)
    //
    //   3. Also handle token refresh — FirebaseMessaging.instance.onTokenRefresh
    //      fires when the token rotates and you should re-send it:
    //
    //        FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
    //          apiService.postData(endpoint: '/users/fcm-token',
    //                              data: {'fcmToken': newToken});
    //        });

    // Send token to backend
    if (token != null) {
      try {
        // You need access to apiService here — either inject it or use a static accessor
        await widget.apiService.postData(
          endpoint: '/handshakes/fcm-token',
          data: {'fcmToken': token},
        );
      } catch (e) {
        debugPrint('Failed to send FCM token to backend: $e');
      }
    }

    // Re-send on token rotation
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
      try {
        await widget.apiService.postData(
          endpoint: '/handshakes/fcm-token',
          data: {'fcmToken': newToken},
        );
      } catch (e) {
        debugPrint('Failed to refresh FCM token: $e');
      }
    });
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
      } else if (message.data['type'] == 'family_request') {
        context.read<FamilyAccessProvider>().fetchPendingRequests();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('A family member wants to access your medical data'),
            backgroundColor: Colors.purple,
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
    } else if (message.data['type'] == 'family_request') {
      if (mounted) context.read<FamilyAccessProvider>().fetchPendingRequests();
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  // --- BUILD UI ---
  @override
  Widget build(BuildContext context) {
    return Theme(
      data: patientTheme,
      child: Consumer<ProxySessionProvider>(
        builder: (context, proxy, _) {
          return Scaffold(
            body: Column(
              children: [
                // --- PROXY BANNER: visible across all tabs when x is viewing y ---
                if (proxy.isProxying)
                  Material(
                    color: const Color(0xFF6A1B9A),
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.swap_horiz,
                              color: Colors.white,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                "Viewing ${proxy.proxyPatientName ?? 'family member'}'s profile",
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            TextButton(
                              onPressed: proxy.switchBack,
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 4,
                                ),
                                backgroundColor:
                                    Colors.white.withValues(alpha: 0.2),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(20),
                                ),
                              ),
                              child: const Text(
                                'Switch Back',
                                style: TextStyle(fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                // --- MAIN PAGES ---
                Expanded(
                  child: PageView(
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
                ),
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
                    label: "Home",
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.calendar_month_outlined),
                    activeIcon: Icon(Icons.calendar_month),
                    label: 'Activity',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.description_outlined),
                    activeIcon: Icon(Icons.description),
                    label: 'Documents',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.person_outline),
                    activeIcon: Icon(Icons.person),
                    label: 'Profile',
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

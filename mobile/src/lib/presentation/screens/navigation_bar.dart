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
import '../viewmodels/patient_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
          endpoint: '/FCM/fcm-token',
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
          endpoint: '/FCM/fcm-token',
          data: {'fcmToken': newToken},
        );
      } catch (e) {
        debugPrint('Failed to refresh FCM token: $e');
      }
    });
    // Listen for Foreground Messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      if (!mounted) return;
      final type = message.data['type'];
      final title = message.notification?.title ?? '';
      final body = message.notification?.body ?? '';

      if (type == 'grant_request') {
        context.read<AccessGrantProvider>().fetchPendingGrants();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('A doctor is requesting access to your data'),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 4),
          ),
        );
      } else if (type == 'family_request') {
        context.read<FamilyAccessProvider>().fetchPendingRequests();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('A family member wants to access your medical data'),
            backgroundColor: Colors.purple,
            duration: Duration(seconds: 4),
          ),
        );
      } else if (type == 'grant_approved') {
        // Y's access was approved by X — refresh Y's accessible members list
        // and navigate to Profile tab so Y can see X in the list immediately.
        context.read<FamilyAccessProvider>().fetchAccessibleMembers();
        setState(() => selectedIndex = 3);
        _pageController.animateToPage(
          3,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(body.isNotEmpty ? body : 'Your access request was approved'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 4),
          ),
        );
      } else if (type == 'data_updated') {
        // Re-fetch the currently-displayed profile so the change appears live.
        final proxy = context.read<ProxySessionProvider>();
        final patientProvider = context.read<PatientProvider>();
        if (proxy.isProxying && proxy.proxyPatientId != null) {
          patientProvider.fetchProfile(proxy.proxyPatientId!);
        } else {
          // Own profile: use the SAME id source as MyProfile._loadProfile.
          SharedPreferences.getInstance().then((prefs) {
            final id = prefs.getString('currentUserId');
            if (id != null && id.isNotEmpty) patientProvider.fetchProfile(id);
          });
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(body.isNotEmpty ? body : 'Health data was updated'),
            backgroundColor: Colors.blueGrey,
            duration: const Duration(seconds: 4),
          ),
        );
      } else if (type == 'access_revoked') {
        // X revoked Y's access. Drop X from Y's accessible list, and if Y is
        // currently viewing X in proxy mode, exit back to Y's own profile.
        final revokedPatientId = message.data['patientId'];
        final proxy = context.read<ProxySessionProvider>();
        if (proxy.isProxying && proxy.proxyPatientId == revokedPatientId) {
          proxy.switchBack();
        }
        context.read<FamilyAccessProvider>().fetchAccessibleMembers();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(body.isNotEmpty ? body : 'Your access to a patient was revoked'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      } else if (message.notification != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(title.isNotEmpty ? title : 'New Message'),
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
    if (!mounted) return;
    final type = message.data['type'];
    if (type == 'grant_request') {
      context.read<AccessGrantProvider>().fetchPendingGrants();
    } else if (type == 'family_request') {
      context.read<FamilyAccessProvider>().fetchPendingRequests();
    } else if (type == 'grant_approved') {
      context.read<FamilyAccessProvider>().fetchAccessibleMembers();
    } else if (type == 'access_revoked') {
      final revokedPatientId = message.data['patientId'];
      final proxy = context.read<ProxySessionProvider>();
      if (proxy.isProxying && proxy.proxyPatientId == revokedPatientId) {
        proxy.switchBack();
      }
      context.read<FamilyAccessProvider>().fetchAccessibleMembers();
    }
  }

  // Profile tab index in the PageView below.
  static const int _profileTabIndex = 3;

  // Re-fetch the profile data whenever the user lands on the Profile tab.
  // The PageView keeps MyProfile alive, so its initState only runs once and it
  // would otherwise show stale data after another user edited this patient.
  void _refreshProfileTab() {
    if (!mounted) return;
    final proxy = context.read<ProxySessionProvider>();
    final patientProvider = context.read<PatientProvider>();
    if (proxy.isProxying && proxy.proxyPatientId != null) {
      patientProvider.fetchProfile(proxy.proxyPatientId!);
      return;
    }
    // Own profile: use the SAME id source as MyProfile._loadProfile
    // (SharedPreferences 'currentUserId') so the _expectedProfileId guard matches.
    SharedPreferences.getInstance().then((prefs) {
      final id = prefs.getString('currentUserId');
      if (id != null && id.isNotEmpty) patientProvider.fetchProfile(id);
    });
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
                      if (index == _profileTabIndex) _refreshProfileTab();
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
                  if (index == _profileTabIndex) _refreshProfileTab();
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

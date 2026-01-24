import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';



class Notifications extends StatefulWidget {
  const Notifications({super.key});

  @override
  State<Notifications> createState() => _NotificationsState();
}

class _NotificationsState extends State<Notifications> {
  
  @override
  void initState() {
    super.initState();
    setupInteractedMessage();
  }

  Future<void> setupInteractedMessage() async {
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    // REQUEST PERMISSION (Required for iOS & Android 13+)
    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');
    }

    // GET THE TOKEN 
    String? token = await messaging.getToken();
    print("FCM Token: $token");

    // LISTEN FOR FOREGROUND MESSAGES
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Got a message whilst in the foreground!');
      if (message.notification != null) {
        print('Message also contained a notification: ${message.notification}');
        // Show a dialog or snackbar here
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text("FCM Example")),
        body: const Center(child: Text("Waiting for messages...")),
      ),
    );
  }
}
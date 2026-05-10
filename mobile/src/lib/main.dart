import 'package:flutter/material.dart';
import 'package:medflow/utils/themes/theme.dart';
import 'presentation/screens/splash_screen.dart';
import 'package:media_store_plus/media_store_plus.dart';
import 'package:provider/provider.dart';
import 'presentation/viewmodels/booking_provider.dart';
import 'data/services/datasources/api_service_booking.dart';
import 'data/repositories/booking_repo_impl.dart';
import 'data/services/pdf_storage_service.dart';
import 'data/services/image_storage_service.dart';
import 'data/repositories/document_repository_impl.dart';
import 'presentation/viewmodels/document_provider.dart';
import 'presentation/viewmodels/vitals_provider.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'domain/repository/major_event_repo.dart';
import 'presentation/viewmodels/major_event_provider.dart';
import 'domain/repository/vitals_repository_impl.dart';
import 'data/services/datasources/health_connect_data_source.dart';

// auth
import 'presentation/viewmodels/auth_viewmodel.dart';
import 'domain/usecases/auth_usecases.dart';
import 'data/services/datasources/keycloak_remote_data_source.dart';
import 'data/repositories/auth_repo_impl.dart';

import 'presentation/routes/app_router.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print("Handling a background message: ${message.messageId}");
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await MediaStore.ensureInitialized();
  MediaStore.appFolder = 'CFICareDocs';

  // Initialize Firebase and Messaging (From Mobile-New-Branch-Merge)
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // Initialize Authentication (From HEAD)
  final authDatasource = KeycloakRemoteDataSource();
  final authRepo = AuthenticationRepoImpl(datasource: authDatasource);
  final authUsecases = AuthUsecases(repo: authRepo);
  final authProvider = AuthProvider(authUsecases);
  authProvider.init();
  var isHandlingUnauthorized = false;

  // 1. Create the API Service (Data Source) with Auth interceptors (From HEAD)
  final apiService = ApiService(
    getAccessToken: () => authUsecases.getValidAccessToken(),
    refreshToken: () async {
      final s = await authUsecases.refreshSession();
      return s.accessToken;
    },
    onUnauthorized: () async {
      if (isHandlingUnauthorized) return;
      isHandlingUnauthorized = true;
      try {
        await authProvider.logout();
      } catch (e) {
        debugPrint('[AUTH] auto-logout after unauthorized failed: $e');
      } finally {
        isHandlingUnauthorized = false;
      }
      // await authUsecases.logout();
      // debugPrint('[AUTH] skipped auto-logout during debug for 401 res from backend in case of errors -_-');
    },
  );

  final pdfService = PdfStorageService();
  final imgService = ImageStorageService();

  // Create the Repository
  final bookingRepo = BookingRepositoryImpl(apiService);
  final docRepo = DocumentRepositoryImpl(pdfService, imgService, apiService);
  final vitalsRepo = VitalsRepositoryImpl(HealthConnectDataSource());
  final eventRepo = MajorEventRepository(apiService);

  final router = buildRouter(authProvider);

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => BookingProvider(bookingRepo)),
        ChangeNotifierProvider(create: (_) => DocumentProvider(docRepo)),
        ChangeNotifierProvider(create: (_) => VitalsProvider(vitalsRepo)),
        ChangeNotifierProvider(create: (_) => MajorEventProvider(eventRepo)),
        ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
      ],
      child: MaterialApp.router(
        // home: SplashScreen(),
        debugShowCheckedModeBanner: false,
        theme: patientTheme,
        routerConfig: router,
      ),
    ),
  );
}
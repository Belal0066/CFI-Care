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
import 'data/repositories/vitals_repo.dart';
import 'presentation/viewmodels/vitals_provider.dart';

import 'domain/repository/major_event_repo.dart';
import 'presentation/viewmodels/major_event_provider.dart';

// auth 
import 'presentation/viewmodels/auth_viewmodel.dart';
import 'domain/usecases/auth_usecases.dart';
import 'data/services/datasources/keycloak_remote_data_source.dart';
import 'data/repositories/auth_repo_impl.dart';

import 'presentation/routes/app_router.dart';


void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await MediaStore.ensureInitialized();
  MediaStore.appFolder = 'CFICareDocs';


  final authDatasource = KeycloakRemoteDataSource();
  final authRepo = AuthenticationRepoImpl(datasource: authDatasource);
  final authUsecases = AuthUsecases(repo: authRepo);
  final authProvider = AuthProvider(authUsecases);
  await authProvider.init();
  
  // 1. Create the API Service (Data Source)
  final apiService = ApiService( 
    // getAccessToken: () => authUsecases.getValidAccessToken(),
    // forceRefreshToken: () async {
    //   final s = await authUsecases.refreshSession();
    //   return s.accessToken;
    // },
    // onUnauthorized: () async {
    //   await authUsecases.logout();
    // },
    );
  final pdfService = PdfStorageService();
  final imgService = ImageStorageService();

  // 2. Create the Repository
  final bookingRepo = BookingRepositoryImpl(apiService);
  final docRepo = DocumentRepositoryImpl(pdfService, imgService, apiService);
  final vitalsRepo = VitalsRepository();
  final eventRepo = MajorEventRepository();


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

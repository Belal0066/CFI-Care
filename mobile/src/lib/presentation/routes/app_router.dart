import 'package:go_router/go_router.dart';

import '../screens/navigation_bar.dart';
// import '../screens/sign_in_up.dart';
import '../screens/auth_screen.dart';
import '../screens/splash_screen.dart';
import '../viewmodels/auth_viewmodel.dart';

import '../../data/services/datasources/api_service_booking.dart';

GoRouter buildRouter(AuthProvider authProvider, ApiService apiService) {
  return GoRouter(
    initialLocation: '/loading',
    refreshListenable: authProvider,
    redirect: (context, state) {


      
      final status = authProvider.status;
      final loc = state.matchedLocation;

      final atLoading = loc == '/loading';
      final atAuth = loc == '/auth';
      final atApp = loc == '/app';

      final isBusy = status == AuthStatus.unknown ||
          // status == AuthStatus.authenticating ||
          status == AuthStatus.refreshing;

      if (isBusy) return atLoading ? null : '/loading';

      if (status == AuthStatus.authenticated) {
        return atApp ? null : '/app';
      }





      // unauth
      return atAuth ? null : '/auth';
    },
    routes: [
      GoRoute(
        path: '/loading',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/auth',
        builder: (context, state) => const AuthEntryScreen(),
      ),
      GoRoute(
        path: '/app',
        builder: (context, state) => MyApp(apiService: apiService),
      ),
    ],
  );
}
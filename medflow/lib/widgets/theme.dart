// // lib/theme/my_app_theme.dart
import 'package:flutter/material.dart';

// class MyTheme {
//   // Define a professional, calming blue as the base color
//   static final Color _lightSeedColor = Colors.blue.shade700;
  
//   // Define your light theme
//   static final ThemeData lightTheme = ThemeData(
//     useMaterial3: true,
    
//     // Generate the color scheme from the seed color
//     colorScheme: ColorScheme.fromSeed(
//       seedColor: _lightSeedColor,
//       brightness: Brightness.light,
//     ),
    
//     // Set a clean, slightly off-white background
//     scaffoldBackgroundColor: Colors.grey[50],

//     // Customize the AppBar theme
//     appBarTheme: AppBarTheme(
//       // Use a clean white/light background for AppBars
//       backgroundColor: Colors.grey[50], 
//       foregroundColor: Colors.black87, // Text/icon color
//       elevation: 1,
//       surfaceTintColor: Colors.transparent, // Keeps it white on scroll
//       centerTitle: true, // You use this in most of your screens
//       titleTextStyle: const TextStyle(
//         fontSize: 20,
//         fontWeight: FontWeight.w600,
//         color: Colors.black87,
//       ),
//     ),

//     // Customize the Card theme to match your style
//     cardTheme: CardThemeData(
//       elevation: 2,
//       shape: RoundedRectangleBorder(
//         borderRadius: BorderRadius.circular(16.0), // Matches your card style
//       ),
//       color: Colors.white,
//       surfaceTintColor: Colors.white,
//       margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
//     ),

//     // Customize the main NavigationBar
//     navigationBarTheme: NavigationBarThemeData(
//       backgroundColor: Colors.white,
//       surfaceTintColor: Colors.white,
//       indicatorColor: Colors.blue.shade100, // Color for the selected item's "pill"
//       labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
//       elevation: 2,
//     ),

//     // Customize Floating Action Buttons
//     floatingActionButtonTheme: FloatingActionButtonThemeData(
//       backgroundColor: _lightSeedColor,
//       foregroundColor: Colors.white,
//     ),
//   );
// }

final ThemeData patientTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor: const Color(0xFF1976D2),
  // scaffoldBackgroundColor: const Color(0xFFE3F2FD),
  cardColor: Colors.white,
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFF1565C0),
    elevation: 2,
    titleTextStyle: TextStyle(
      color: Colors.white,
      fontSize: 22,
      fontWeight: FontWeight.bold,
    ),
    iconTheme: IconThemeData(color: Colors.white),
  ),
  textTheme: const TextTheme(
    bodyMedium: TextStyle(color: Color(0xFF0D1B2A)),
    titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
  ),
  colorScheme: const ColorScheme.light(
    primary: Color(0xFF1976D2),
    secondary: Color(0xFF64B5F6),
    surface: Colors.white,
    onSurface: Color(0xFF0D1B2A),
  ),
  useMaterial3: true,
);

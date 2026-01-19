// // lib/theme/my_app_theme.dart
import 'package:flutter/material.dart';

const Color brandBlue = Color(0xFF0073CF);

final ThemeData patientTheme = ThemeData(
  brightness: Brightness.light,
  primaryColor:  const Color.fromARGB(255, 25, 136, 210),
  scaffoldBackgroundColor: const Color(0xFFF2F4F7),
  cardColor: Colors.white,
  appBarTheme: const AppBarTheme(
    backgroundColor:   Color.fromARGB(255, 25, 136, 210),
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
    primary: Color.fromARGB(255, 25, 136, 210),
    secondary: Color(0xFF64B5F6),
    surface: Colors.white,
    onSurface: Color(0xFF0D1B2A),
  ),
  useMaterial3: true,
);

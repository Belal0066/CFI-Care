import 'package:flutter/material.dart';
import 'package:medflow/widgets/theme.dart';
import './screens/splash_screen.dart';


void main() async{
  
  WidgetsFlutterBinding.ensureInitialized();
  
  runApp(MaterialApp(home :SplashScreen(),
  debugShowCheckedModeBanner: false,
  theme: patientTheme,));
}


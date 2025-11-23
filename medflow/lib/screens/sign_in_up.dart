import 'package:flutter/material.dart';
import 'package:medflow/widgets/theme.dart';
import '../widgets/custom_slider_selector.dart';
import '../widgets/sign_in.dart';
import '../widgets/sign_up.dart';
// import '../themes/my_app_theme.dart';

class SignInUp extends StatefulWidget {
  const SignInUp({super.key});
  @override
  State<SignInUp> createState() => _SignInUpState();
}

class _SignInUpState extends State<SignInUp> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: patientTheme,
      home:  Scaffold(
          // appBar:
              // AppBar(title: const Text('Hydroponic System'), centerTitle: true),
          resizeToAvoidBottomInset: true,
          body: Center(
            child: SingleChildScrollView(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24.0,
                    vertical: 26.0,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      
                      Text(
                        "CFI-CARE",
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        "Your Health, Our Priority",
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 16, color: Colors.grey[600]),
                      ),
                      const SizedBox(height: 10),
                      CustomSliderSelector(
                        onChangedIndex: (index) {
                          setState(() {
                            _selectedIndex = index;
                          });
                        },
                        options: ['Login', 'Register'],
                        selectedIndex: _selectedIndex,
                      ),
                      const SizedBox(height: 20),
                      AutofillGroup(
                        child: Builder(
                          builder: (context) {
                            if (_selectedIndex == 0) {
                              return const SignIn();
                            } else {
                              return const SignUp();
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
  }
}

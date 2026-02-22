import 'package:flutter/material.dart';
import 'form_signinup_authentication.dart';
import 'package:flutter/services.dart';
import '../screens/navigation_bar.dart';
import 'package:fluttertoast/fluttertoast.dart';
// FIX 1: Add SharedPreferences import
import 'package:shared_preferences/shared_preferences.dart';
import '../../database/db_helper.dart';


// remove lel stae mgmt
import '../../domain/usecases/auth_usecases.dart';
import 'package:http/http.dart' as http;
import '../../data/repositories/auth_repo_impl.dart';
import '../../data/services/datasources/keycloak_remote_data_source.dart';

class SignIn extends StatefulWidget {
  const SignIn({super.key});
  @override
  State<SignIn> createState() => _SignInState();
}

class _SignInState extends State<SignIn> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passController = TextEditingController();
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailController.dispose();
    _passController.dispose();
    super.dispose();
  }

  /// ✅ Handle Login Button Press
  void _handleSignIn() async {
    if (_formKey.currentState!.validate()) {
      TextInput.finishAutofillContext();
      final email = _emailController.text.trim();
      final password = _passController.text.trim();

      // 1. Check Database
      // final userId = await DBHelper.validateUser(email, password);



      // try{
        final loginData =await AuthUsecases(repo: AuthenticationRepoImpl(datasource: KeycloakRemoteDataSource())).login(email, password);
        final userId = loginData.sub;
      // }
      

      if (userId != null) {
        // --- FIX 2: SAVE SESSION ---
        // This is the critical missing step!
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('currentUserId', userId);
        
        // Optional: Update static session if you use it elsewhere
        Session.currentUserId = userId; 

        // 3. Navigate
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (context) => const MyApp()),
          );
        }
      } else {
        if (mounted) {
          Fluttertoast.showToast(msg:'Invalid credentials');
        }
      }
    }
  }

  String? _emailValidator(String? value) {
    if (value == null || value.trim().isEmpty) return 'Please enter your email';
    final pattern = r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$';
    final regExp = RegExp(pattern);
    if (!regExp.hasMatch(value.trim())) return 'Enter a valid email address';
    return null;
  }

  String? _passwordValidator(String? value) {
    if (value == null || value.isEmpty) return 'Please enter your password';
    if (value.length < 6) return 'Password must be at least 6 characters long';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SignInUpFormAuthentication(
            controller: _emailController,
            label: "Email",
            validator: _emailValidator,
            autofillHints: const [AutofillHints.email],
          ),
          SignInUpFormAuthentication(
            controller: _passController,
            label: "Password",
            validator: _passwordValidator,
            isPassword: true,
            autofillHints: const [AutofillHints.password],
          ),
          FilledButton(
            onPressed: _handleSignIn,
            style: FilledButton.styleFrom(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: const Text("Log In"),
          ),
          TextButton(
            onPressed: () {
              print("Forgot Password Clicked");
            },
            child: const Text("Forgot Password?"),
          ),
        ],
      ),
    );
  }
}
import 'package:flutter/material.dart';
import 'form_signinup_authentication.dart';
import 'package:flutter/services.dart';
import '../screens/navigation_bar.dart';
import '../../utils/email_password_validators.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

// FIX 1: Import ONLY the main helper
import '../../database/db_helper.dart';

final _uuid = const Uuid();

class SignUp extends StatefulWidget {
  const SignUp({super.key});
  @override
  State<SignUp> createState() => _SignUpState();
}

class _SignUpState extends State<SignUp> {
  final TextEditingController _firstNameController = TextEditingController();
  final TextEditingController _lastNameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passController = TextEditingController();
  final TextEditingController _confirmPassController = TextEditingController();
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailController.dispose();
    _passController.dispose();
    _confirmPassController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    super.dispose();
  }

  // Sync patient to FHIR backend
  Future<void> _syncPatientToFHIR(
    String userId,
    String firstName,
    String lastName,
    String email,
  ) async {
    // const String backendUrl = "http://10.0.2.2:3000/api/patients/sync-fhir";

    const String backendUrl = "http://192.168.1.37:3000/api/patients/sync-fhir";

    final Map<String, dynamic> patientData = {
      "id": userId,
      "firstName": firstName,
      "lastName": lastName,
      "email": email,
      "phone": "",
      "gender": "unknown",
      "dob": "",
    };

    try {
      final response = await http.post(
        Uri.parse(backendUrl),
        headers: {"Content-Type": "application/json"},
        body: json.encode(patientData),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        print("Patient synced to FHIR successfully: $userId");
      } else {
        throw Exception("Failed to sync patient: ${response.body}");
      }
    } catch (e) {
      throw Exception("Error syncing patient to FHIR: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // First Name Field
            TextFormField(
              controller: _firstNameController,
              decoration: InputDecoration(
                labelText: 'First Name',
                hintText: 'e.g. John',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              keyboardType: TextInputType.name,
              textCapitalization: TextCapitalization.words,
              validator: (value) =>
                  (value == null || value.isEmpty) ? 'Enter first name' : null,
            ),
            const SizedBox(height: 16),

            // Last Name Field
            TextFormField(
              controller: _lastNameController,
              decoration: InputDecoration(
                labelText: 'Last Name',
                hintText: 'e.g. Doe',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              keyboardType: TextInputType.name,
              textCapitalization: TextCapitalization.words,
              validator: (value) =>
                  (value == null || value.isEmpty) ? 'Enter last name' : null,
            ),
            const SizedBox(height: 16),

            SignInUpFormAuthentication(
              controller: _emailController,
              label: "Email",
              validator: EmailPasswordValidators.emailValidator,
              isRegistration: true,
              autofillHints: const [AutofillHints.email],
            ),

            SignInUpFormAuthentication(
              controller: _passController,
              label: "Password",
              validator: EmailPasswordValidators.passwordValidator,
              isPassword: true,
              isRegistration: true,
              autofillHints: const [AutofillHints.password],
            ),

            SignInUpFormAuthentication(
              controller: _confirmPassController,
              label: "Confirm Password",
              validator: (value) =>
                  EmailPasswordValidators.confirmPasswordValidator(
                    value,
                    _passController,
                  ),
              isPassword: true,
              isConfirmPassword: true,
              isRegistration: true,
              autofillHints: const [AutofillHints.newPassword],
            ),

            FilledButton(
              onPressed: () async {
                if (_formKey.currentState!.validate()) {
                  TextInput.finishAutofillContext();

                  final email = _emailController.text.trim();
                  final password = _passController.text.trim();

                  // 1. Check duplicate
                  final exists = await DBHelper.emailExists(email);
                  if (exists) {
                    Fluttertoast.showToast(msg: "Email already registered");
                    return;
                  }

                  // 2. Generate ONE ID for everything
                  final newUserId = _uuid.v4();

                  // 3. Insert Login Credentials
                  await DBHelper.insertUser(
                    userId: newUserId,
                    email: email,
                    password: password,
                  );

                  // 4. FIX 2: Use DBHelper.upsertProfile (Unified DB)
                  await DBHelper.upsertProfile(newUserId, {
                    'firstName': _firstNameController.text.trim(),
                    'lastName': _lastNameController.text.trim(),
                    'email': email,
                    // Empty defaults
                    'phone': '', 'address': '', 'dob': '', 'gender': '',
                    'bloodType': '', 'height': '', 'weight': '',
                    'allergies': '', 'conditions': '', 'medications': '',
                    'geneticConditions': '', 'chronicDiseases': '',
                    'emergencyContact': '',
                    'insuranceProvider': '',
                    'policyNumber': '',
                  });

                  // 5. Sync patient to FHIR
                  try {
                    await _syncPatientToFHIR(
                      newUserId,
                      _firstNameController.text.trim(),
                      _lastNameController.text.trim(),
                      email,
                    );
                  } catch (e) {
                    print("Warning: Could not sync patient to FHIR: $e");
                    // Don't block signup if FHIR sync fails
                  }

                  // 6. Save Session so MyProfile knows who is logged in
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setString('currentUserId', newUserId);
                  Session.currentUserId = newUserId;

                  if (context.mounted) {
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(builder: (ctx) => const MyApp()),
                    );
                  }
                }
              },
              style: FilledButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: const Text("Sign Up"),
            ),
          ],
        ),
      ),
    );
  }
}

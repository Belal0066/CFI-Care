import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

final RegExp emojiRegex = RegExp(
  r'[\u{1F600}-\u{1F64F}'
  r'\u{1F300}-\u{1F5FF}'
  r'\u{1F680}-\u{1F6FF}'
  r'\u{1F1E0}-\u{1F1FF}'
  r'\u{2600}-\u{26FF}'
  r'\u{2700}-\u{27BF}]',
  unicode: true,
);
class PersonalInfoFromAuthentication extends StatefulWidget {
  final String phoneNumber;
  final String address;
  final DateTime dateOfBirth;
  final String gender;  

  final TextEditingController controller;
  final String? Function(String?) validator;
  final Iterable<String>? autofillHints;

  const PersonalInfoFromAuthentication({
    super.key,
    required this.phoneNumber,
    required this.controller,
    required this.validator,
    required this.address,
    required this.dateOfBirth,
    required this.gender, 
    required this.autofillHints ,
  });

  @override
  State<PersonalInfoFromAuthentication> createState() => _PersonalInfoFromAuthentication();
}

class _PersonalInfoFromAuthentication extends State<PersonalInfoFromAuthentication> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          autofillHints:widget.autofillHints ,
          keyboardType: TextInputType.text,
          inputFormatters: [FilteringTextInputFormatter.deny(emojiRegex)],
          validator: widget.validator,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          controller: widget.controller,
          decoration: InputDecoration(
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
      ],
    );
  }
}

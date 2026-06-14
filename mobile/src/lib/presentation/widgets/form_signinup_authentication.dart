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

class SignInUpFormAuthentication extends StatefulWidget {
  final String label;
  final TextEditingController controller;
  final String? Function(String?) validator;
  final bool isPassword;
  final bool isConfirmPassword;
  final bool isRegistration;
  final Iterable<String>? autofillHints;

  const SignInUpFormAuthentication({
    super.key,
    required this.label,
    required this.controller,
    required this.validator,
    this.isPassword = false,
    this.isConfirmPassword = false,
    this.isRegistration = false,
    required this.autofillHints ,
  });

  @override
  State<SignInUpFormAuthentication> createState() => _SignInUpFormAuthentication();
}

class _SignInUpFormAuthentication extends State<SignInUpFormAuthentication> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Text(widget.label, style: const TextStyle(fontSize: 20)),
        TextFormField(
          autofillHints:widget.autofillHints ,
          keyboardType: widget.isPassword
              ? TextInputType.visiblePassword
              : TextInputType.emailAddress,
          inputFormatters: [FilteringTextInputFormatter.deny(emojiRegex)],
          validator: widget.validator,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          controller: widget.controller,
          obscureText: widget.isPassword,
          decoration: InputDecoration(
            labelText: widget.label,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            hintText: widget.isPassword
                ? widget.isConfirmPassword
                      ? "Confirm your Password"
                      : "Enter your Password"
                : "Example@example.com",
          ),
          textInputAction: (widget.isConfirmPassword
              ? TextInputAction
                    .done 
              : (widget.isPassword
                    ? (widget.isRegistration
                          ? TextInputAction.next
                          : TextInputAction
                                .done) 
                    : TextInputAction
                          .next 
                          )),

          onFieldSubmitted: (value) {
            //
          },
          textCapitalization: widget.isPassword
              ? TextCapitalization.none
              : TextCapitalization.sentences,
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

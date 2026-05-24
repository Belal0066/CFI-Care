import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 6-box PIN entry used by x to submit y's family access code.
/// Calls [onSubmit] with the 6-digit string when the user taps Send.
class FamilyOtpInput extends StatefulWidget {
  final bool isSubmitting;
  final String? errorText;
  final Future<void> Function(String code) onSubmit;

  const FamilyOtpInput({
    super.key,
    required this.isSubmitting,
    required this.errorText,
    required this.onSubmit,
  });

  @override
  State<FamilyOtpInput> createState() => _FamilyOtpInputState();
}

class _FamilyOtpInputState extends State<FamilyOtpInput> {
  static const int _length = 6;

  final List<TextEditingController> _controllers =
      List.generate(_length, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(_length, (_) => FocusNode());

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get _code => _controllers.map((c) => c.text).join();

  void _onChanged(int index, String value) {
    if (value.length == 1 && index < _length - 1) {
      _focusNodes[index + 1].requestFocus();
    }
    setState(() {});
  }

  void _onKeyEvent(int index, KeyEvent event) {
    if (event is KeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace &&
        _controllers[index].text.isEmpty &&
        index > 0) {
      _focusNodes[index - 1].requestFocus();
      _controllers[index - 1].clear();
      setState(() {});
    }
  }

  void _clear() {
    for (final c in _controllers) {
      c.clear();
    }
    _focusNodes[0].requestFocus();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final bool ready = _code.length == _length && !widget.isSubmitting;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // --- 6 boxes ---
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(_length, (i) {
            return SizedBox(
              width: 44,
              height: 52,
              child: KeyboardListener(
                focusNode: FocusNode(),
                onKeyEvent: (e) => _onKeyEvent(i, e),
                child: TextField(
                  controller: _controllers[i],
                  focusNode: _focusNodes[i],
                  enabled: !widget.isSubmitting,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  maxLength: 1,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    counterText: '',
                    contentPadding: EdgeInsets.zero,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(
                        color: Color(0xFF1E6ED3),
                        width: 2,
                      ),
                    ),
                    errorBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Colors.red),
                    ),
                    filled: true,
                    fillColor: widget.isSubmitting
                        ? Colors.grey.shade100
                        : Colors.white,
                  ),
                  onChanged: (v) => _onChanged(i, v),
                ),
              ),
            );
          }),
        ),

        // --- Error text ---
        if (widget.errorText != null) ...[
          const SizedBox(height: 6),
          Text(
            widget.errorText!,
            style: const TextStyle(color: Colors.red, fontSize: 12),
          ),
        ],

        const SizedBox(height: 12),

        // --- Send button ---
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: ready
                ? () async {
                    await widget.onSubmit(_code);
                    _clear();
                  }
                : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E6ED3),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              minimumSize: const Size(0, 44),
            ),
            child: widget.isSubmitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Send Request'),
          ),
        ),
      ],
    );
  }
}

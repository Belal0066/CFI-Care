import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../utils/personal_info_validators.dart';
import '../../utils/my_profile_icons.dart';

final RegExp emojiRegex = RegExp(
  r'[\u{1F600}-\u{1F64F}'
  r'\u{1F300}-\u{1F5FF}'
  r'\u{1F680}-\u{1F6FF}'
  r'\u{1F1E0}-\u{1F1FF}'
  r'\u{2600}-\u{26FF}'
  r'\u{2700}-\u{27BF}]',
  unicode: true,
);

class BuildSectionProfile extends StatefulWidget {
  final IconData leading;
  final String title;
  final bool show;
  final VoidCallback onToggle;
  final VoidCallback onEditToggle;
  final bool isEditing;
  final Map<String, String> data;

  const BuildSectionProfile({
    super.key,
    required this.leading,
    required this.title,
    required this.show,
    required this.onToggle,
    required this.onEditToggle,
    required this.isEditing,
    required this.data,
  });

  @override
  State<BuildSectionProfile> createState() => _BuildSectionProfileState();
}

class _BuildSectionProfileState extends State<BuildSectionProfile> {
  final _formKey = GlobalKey<FormState>();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        mainAxisSize: MainAxisSize.min, // Prevents layout crash
        children: [
          // --- Header Row ---
          ListTile(
            leading: Icon(widget.leading, color: Colors.blue),
            title: Text(
              widget.title,
              style: textTheme.titleMedium?.copyWith(
                color: Colors.black87,
                fontWeight: FontWeight.bold,
              ),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Edit / Done Button
                TextButton.icon(
                  onPressed: () {
                    if (widget.isEditing) {
                      // Validate only if form exists. Allow saving empty forms (Flexible).
                      final isValid = _formKey.currentState?.validate() ?? true;
                      if (isValid) {
                        widget.onEditToggle(); // Save and exit edit mode
                      }
                    } else {
                      widget.onEditToggle(); // Enter edit mode
                    }
                  },
                  icon: Icon(
                    widget.isEditing ? Icons.done : Icons.edit,
                    color: widget.isEditing ? Colors.green : Colors.grey,
                    size: 20,
                  ),
                  label: Text(
                    widget.isEditing ? 'Done' : 'Edit',
                    style: TextStyle(
                      color: widget.isEditing ? Colors.green : Colors.grey,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                // Expand/Collapse Arrow
                IconButton(
                  icon: Icon(
                    widget.show
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: Colors.grey,
                  ),
                  onPressed: widget.onToggle,
                ),
              ],
            ),
            onTap: widget.onToggle,
          ),

          // --- Body ---
          if (widget.show)
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: widget.data.entries.map((entry) {
                    final key = entry.key;
                    final value = entry.value;

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: widget.isEditing
                          ? _buildEditItem(key, value)
                          : _buildDisplayItem(key, value),
                    );
                  }).toList(),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // --- Display Widget (Read Only) ---
  Widget _buildDisplayItem(String key, String value) {
    IconData icon = Icons.info_outline;
    if (medicalIcons.containsKey(key)) {
      icon = medicalIcons[key]!;
    } else if (personalIcons.containsKey(key)) {
      icon = personalIcons[key]!;
    } else if (emergencyIcons.containsKey(key)) {
      icon = emergencyIcons[key]!;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: Colors.grey[600]),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: Text(
            key,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.black54,
            ),
          ),
        ),
        Expanded(
          flex: 3,
          child: Text(
            value.isEmpty ? 'Not set' : value,
            style: const TextStyle(
              fontWeight: FontWeight.w500,
              color: Colors.black87,
            ),
          ),
        ),
      ],
    );
  }

  // --- Edit Widget (Inputs with Logic) ---
  Widget _buildEditItem(String key, String value) {
    // 1. Blood Type Dropdown
    if (key == 'Blood Type') {
      return DropdownButtonFormField<String>(
        initialValue: value.isNotEmpty ? value : null,
        decoration: _inputDecoration(key),
        items: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
            .map((type) => DropdownMenuItem(value: type, child: Text(type)))
            .toList(),
        onChanged: (val) => setState(() => widget.data[key] = val ?? ''),
        // No validator = Optional
      );
    }

    // 2. Gender Dropdown
    if (key == 'Gender') {
      return DropdownButtonFormField<String>(
        initialValue: value.isNotEmpty ? value : null,
        decoration: _inputDecoration(key),
        items: [
          'Male',
          'Female',
        ].map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
        onChanged: (val) => setState(() => widget.data[key] = val ?? ''),
        // No validator = Optional
      );
    }

    // 3. Date Picker
    if (key == 'Date of Birth') {
      return InkWell(
        onTap: () async {
          final DateTime? pickedDate = await showDatePicker(
            context: context,
            initialDate: DateTime(2000),
            firstDate: DateTime(1900),
            lastDate: DateTime.now(),
          );
          if (pickedDate != null) {
            setState(() {
              widget.data[key] =
                  "${pickedDate.day.toString().padLeft(2, '0')}/"
                  "${pickedDate.month.toString().padLeft(2, '0')}/"
                  "${pickedDate.year}";
            });
          }
        },
        child: InputDecorator(
          decoration: _inputDecoration(key),
          child: Text(value.isNotEmpty ? value : 'Select Date'),
        ),
      );
    }

    // 4. Phone Field (Flexible Validation)
    if (key == 'Phone') {
      return TextFormField(
        initialValue: value,
        decoration: _inputDecoration(key),
        keyboardType: TextInputType.phone,
        inputFormatters: [FilteringTextInputFormatter.deny(emojiRegex)],
        onChanged: (val) => widget.data[key] = val,
        validator: (val) {
          // If empty, return null (valid). If not empty, check format.
          if (val == null || val.isEmpty) return null;
          return PersonalInfoValidators.phoneNumber(val);
        },
      );
    }

    // 5. Address Field (Flexible Validation)
    if (key == 'Address') {
      return TextFormField(
        initialValue: value,
        decoration: _inputDecoration(key),
        inputFormatters: [FilteringTextInputFormatter.deny(emojiRegex)],
        onChanged: (val) => widget.data[key] = val,
        validator: (val) {
          if (val == null || val.isEmpty) return null;
          return PersonalInfoValidators.address(val);
        },
      );
    }

    // 6. Default Text Field
    return TextFormField(
      initialValue: value,
      decoration: _inputDecoration(key),
      inputFormatters: [FilteringTextInputFormatter.deny(emojiRegex)],
      onChanged: (val) => widget.data[key] = val,
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      border: const OutlineInputBorder(),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      isDense: true,
    );
  }
}

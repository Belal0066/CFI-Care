import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter_doc_scanner/flutter_doc_scanner.dart';
import 'package:medflow/utils/schedule_utils.dart';

import '../models/created_events.dart';
import '../database/db_helper.dart';

class NewEvent extends StatefulWidget {
  const NewEvent({
    required this.getEventsForDay,
    required this.selectedDate,
    required this.refreshEvents,
    super.key,
  });

  final List<Event> Function(DateTime) getEventsForDay;
  final DateTime selectedDate;
  final Future<void> Function() refreshEvents;

  @override
  State<NewEvent> createState() => _NewEventState();
}

class _NewEventState extends State<NewEvent> {
  final _titleController = TextEditingController();
  final _summaryController = TextEditingController();
  final _detailsController = TextEditingController();
  
  TimeOfDay _selectedTime = const TimeOfDay(hour: 0, minute: 0);
  TypeOfEventEnum _selectedEventCategory = TypeOfEventEnum.other;
  SpecialityEventEnum _selectedSpecialityCategory = SpecialityEventEnum.other;
  
  // --- Attachment Logic ---
  String? _filePath;

  Future<void> pickPDF() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
    );
    if (result != null && result.files.single.path != null) {
      await _copyFileToAppDir(result.files.single.path!);
    }
  }

  Future<void> pickImage() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    if (pickedFile != null) {
      await _copyFileToAppDir(pickedFile.path);
    }
  }

  Future<void> scanDocument() async {
    try {
      final scanner = FlutterDocScanner();
      final scanned = await scanner.getScannedDocumentAsPdf(page: 4);
      if (scanned != null && scanned['pdfUri'] != null) {
        String path = scanned['pdfUri'];
        path = path.replaceFirst("file://", "");
        await _copyFileToAppDir(path);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Scan failed: $e")));
      }
    }
  }

  Future<void> _copyFileToAppDir(String originalPath) async {
    final file = File(originalPath);
    if (!file.existsSync()) return;

    final appDir = await getApplicationDocumentsDirectory();
    final newPath = '${appDir.path}/${DateTime.now().millisecondsSinceEpoch}_${file.path.split('/').last}';
    final newFile = await file.copy(newPath);

    setState(() {
      _filePath = newFile.path;
    });
  }

  // --- Save Logic ---
  void _onSaveEvent() async {
    // 1. Validation
    if (_titleController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Title cannot be empty")),
      );
      return;
    }

    // 2. Get User ID
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('currentUserId');

    if (userId == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Error: No user logged in")),
        );
      }
      return;
    }

    // 3. Create Event Object
    final newEvent = Event(
      title: _titleController.text,
      summary: _summaryController.text,
      details: _detailsController.text,
      attachmentPath: _filePath, // Save the attachment path
      selectedTypeOfEventEnum: _selectedEventCategory,
      selectedSpecialityEnum: _selectedSpecialityCategory,
      time: _selectedTime,
    );

    // 4. Save to Database
    await DBHelper.insertEvent(
      userId,
      newEvent,
      widget.selectedDate,
    );
    
    // 5. Refresh Parent UI
    await widget.refreshEvents();

    // 6. Close Modal
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  void _timePicker() async {
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (pickedTime != null) {
      setState(() {
        _selectedTime = pickedTime;
      });
    }
  }

  @override
  void dispose() {
    _summaryController.dispose();
    _detailsController.dispose();
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Use SizedBox to take full height if needed, matching your DocumentAddSheet style
    return SizedBox(
      height: double.infinity,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16, 
          16, 
          16, 
          MediaQuery.of(context).viewInsets.bottom + 16
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // --- Handle Bar ---
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              
              const Text(
                "Add Event",
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),

              // 1. Title
              TextField(
                controller: _titleController,
                maxLength: 50,
                decoration: const InputDecoration(
                  labelText: "Event Title",
                  prefixIcon: Icon(Icons.event),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              
              // 2. Summary
              TextField(
                controller: _summaryController,
                maxLength: 100,
                decoration: const InputDecoration(
                  labelText: "Summary",
                  prefixIcon: Icon(Icons.short_text),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),

              // 3. Details
              TextField(
                controller: _detailsController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: "Details",
                  prefixIcon: Icon(Icons.notes),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),

              // 4. Time Picker
              InkWell(
                onTap: _timePicker,
                borderRadius: BorderRadius.circular(4),
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: "Time",
                    prefixIcon: Icon(Icons.access_time),
                    border: OutlineInputBorder(),
                  ),
                  child: Text(
                    _selectedTime.format(context),
                    style: const TextStyle(fontSize: 16),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // 5. Type & Speciality Dropdowns
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<TypeOfEventEnum>(
                      value: _selectedEventCategory,
                      decoration: const InputDecoration(
                        labelText: "Type",
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                      ),
                      items: TypeOfEventEnum.values.map((cat) {
                        return DropdownMenuItem(
                          value: cat,
                          child: Text(cat.name.toUpperCase(), style: const TextStyle(fontSize: 12)),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) setState(() => _selectedEventCategory = val);
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<SpecialityEventEnum>(
                      value: _selectedSpecialityCategory,
                      decoration: const InputDecoration(
                        labelText: "Speciality",
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                      ),
                      isExpanded: true,
                      items: SpecialityEventEnum.values.map((cat) {
                        return DropdownMenuItem(
                          value: cat,
                          child: Text(cat.name.toUpperCase(), style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) setState(() => _selectedSpecialityCategory = val);
                      },
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 24),

              // --- Attach Files ---
              const Text("Attach File", style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildAttachButton(Icons.picture_as_pdf, "PDF", pickPDF),
                  _buildAttachButton(Icons.image, "Image", pickImage),
                  _buildAttachButton(Icons.camera_alt, "Scan", scanDocument),
                ],
              ),
              
              // Show selected file preview
              if (_filePath != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.attach_file, color: Colors.blue),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _filePath!.split('/').last,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 20),
                        onPressed: () => setState(() => _filePath = null),
                      )
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),

              // 6. Save Button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _onSaveEvent,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text("Save Event", style: TextStyle(fontSize: 16)),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAttachButton(IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 80,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          children: [
            Icon(icon, color: Colors.grey[700]),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(color: Colors.grey[800], fontSize: 12)),
          ],
        ),
      ),
    );
  }
}


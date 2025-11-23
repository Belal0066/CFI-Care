import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_doc_scanner/flutter_doc_scanner.dart';
import 'package:path_provider/path_provider.dart';
import '../utils/schedule_utils.dart';
import '../models/document.dart';


class DocumentAddSheet extends StatefulWidget {
  const DocumentAddSheet({super.key});
  @override
  State<DocumentAddSheet> createState() => _DocumentAddSheetState();
}

class _DocumentAddSheetState extends State<DocumentAddSheet> {
  List<Document> documents = [];
  void openAddDocumentSheet() async {
    final doc = await showModalBottomSheet<Document>(
      context: context,
      isScrollControlled: true,
      builder: (context) => DocumentAddSheet(),
    );

    if (doc != null) {
      setState(() {
        documents.add(doc);
      });
    }
  }
  // Controllers
  final _titleController = TextEditingController();
  final _summaryController = TextEditingController();
  final _detailsController = TextEditingController();
  
  // State Variables
  String? _filePath;
  bool _isPDF = false;
  TimeOfDay _selectedTime = const TimeOfDay(hour: 0, minute: 0);
  TypeOfEventEnum _selectedType = TypeOfEventEnum.other;
  SpecialityEventEnum _selectedSpeciality = SpecialityEventEnum.other;
  
  // --- File Picking Logic ---

  Future<void> pickPDF() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
    );
    if (result != null && result.files.single.path != null) {
      await savePdfFromScanOrPicker(result.files.single.path!);
    }
  }

  Future<void> pickImage() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    if (pickedFile != null) {
      await _copyFileToAppDir(pickedFile.path, isPDF: false);
    }
  }

  Future<void> scanDocument() async {
    try {
      final scanner = FlutterDocScanner();
      final scanned = await scanner.getScannedDocumentAsPdf(page: 4);
      if (scanned != null && scanned['pdfUri'] != null) {
        savePdfFromScanOrPicker(scanned['pdfUri']);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Scan failed: $e")),
        );
      }
    }
  }

  Future<void> _copyFileToAppDir(String originalPath, {required bool isPDF}) async {
    final file = File(originalPath);
    if (!file.existsSync()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("File does not exist!")),
      );
      return;
    }

    final appDir = await getApplicationDocumentsDirectory();
    final newPath =
        '${appDir.path}/${DateTime.now().millisecondsSinceEpoch}_${file.path.split('/').last}';
    final newFile = await file.copy(newPath);

    setState(() {
      _filePath = newFile.path;
      _isPDF = isPDF;
    });
  }

  Future<void> savePdfFromScanOrPicker(String path) async {
    path = path.replaceFirst("file://", "");
    await _copyFileToAppDir(path, isPDF: true);
  }

  // --- Time Picker ---
  void _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked != null) {
      setState(() => _selectedTime = picked);
    }
  }

  // --- Save Logic ---
  void saveDocument() {
    if (_titleController.text.isEmpty || _filePath == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please provide a title and select a file.")),
      );
      return;
    }

    final doc = Document(
      title: _titleController.text,
      filePath: _filePath!,
      isPDF: _isPDF,
      // New Fields
      summary: _summaryController.text,
      details: _detailsController.text,
      time: _selectedTime,
      type: _selectedType,
      speciality: _selectedSpeciality,
    );
    
    Navigator.pop(context, doc);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _summaryController.dispose();
    _detailsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16, 
        16, 
        16, 
        MediaQuery.of(context).viewInsets.bottom + 16
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
              "Add Document",
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            // 1. Title
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: "Document Title",
                prefixIcon: Icon(Icons.title),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),

            // 2. Summary
            TextField(
              controller: _summaryController,
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
              onTap: _pickTime,
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
                    value: _selectedType,
                    decoration: const InputDecoration(
                      labelText: "Type",
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                    ),
                    items: TypeOfEventEnum.values.map((e) {
                      return DropdownMenuItem(
                        value: e,
                        child: Text(e.name.toUpperCase(), style: const TextStyle(fontSize: 12)),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _selectedType = v!),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<SpecialityEventEnum>(
                    value: _selectedSpeciality,
                    decoration: const InputDecoration(
                      labelText: "Speciality",
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                    ),
                    isExpanded: true,
                    items: SpecialityEventEnum.values.map((e) {
                      return DropdownMenuItem(
                        value: e,
                        child: Text(e.name.toUpperCase(), style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _selectedSpeciality = v!),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // 6. File Selection Buttons
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
            
            // Show selected file
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
                    Icon(_isPDF ? Icons.picture_as_pdf : Icons.image, color: Colors.blue),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _filePath!.split('/').last,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w500),
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
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: saveDocument,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text("Save Document", style: TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(height: 16),
          ],
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
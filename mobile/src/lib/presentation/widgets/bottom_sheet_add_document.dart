import 'package:flutter/material.dart';
import 'package:provider/provider.dart'; // <--- Import Provider
import 'package:fluttertoast/fluttertoast.dart';

// Import your classes
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';
import '../viewmodels/add_document_viewmodel.dart'; // <--- The Form Logic (Renamed from DocumentAddViewModel)
import '../viewmodels/document_provider.dart'; // <--- The Data Logic
import 'attach_file.dart'; 

class DocumentAddSheet extends StatefulWidget {
  // We pass the Form ViewModel so the sheet can access input state
  final DocumentAddViewModel viewModel;

  const DocumentAddSheet({super.key, required this.viewModel});

  @override
  State<DocumentAddSheet> createState() => _DocumentAddSheetState();
}

class _DocumentAddSheetState extends State<DocumentAddSheet> {
  late TextEditingController _titleController;
  late TextEditingController _summaryController;
  late TextEditingController _detailsController;

  @override
  void initState() {
    super.initState();
    // Initialize controllers with current values from ViewModel
    _titleController = TextEditingController(text: widget.viewModel.title);
    _summaryController = TextEditingController(text: widget.viewModel.summary);
    _detailsController = TextEditingController(text: widget.viewModel.details);

    // Listen to ViewModel to rebuild UI when file is attached/removed
    widget.viewModel.addListener(_onViewModelChanged);
  }

  void _onViewModelChanged() {
    setState(() {});
  }

  @override
  void dispose() {
    _titleController.dispose();
    _summaryController.dispose();
    _detailsController.dispose();
    widget.viewModel.removeListener(_onViewModelChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Access the Global Data Provider
    final docProvider = context.watch<DocumentProvider>();

    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // --- HANDLE BAR ---
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

            // --- TITLE ---
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: "Document Title",
                prefixIcon: Icon(Icons.title),
                border: OutlineInputBorder(),
              ),
              onChanged: (val) => widget.viewModel.setTitle(val),
            ),
            const SizedBox(height: 12),

            // --- SUMMARY ---
            TextField(
              controller: _summaryController,
              decoration: const InputDecoration(
                labelText: "Summary",
                prefixIcon: Icon(Icons.short_text),
                border: OutlineInputBorder(),
              ),
              onChanged: (val) => widget.viewModel.setSummary(val),
            ),
            const SizedBox(height: 12),

            // --- DETAILS ---
            TextField(
              controller: _detailsController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: "Details",
                prefixIcon: Icon(Icons.notes),
                border: OutlineInputBorder(),
              ),
              onChanged: (val) => widget.viewModel.setDetails(val),
            ),
            const SizedBox(height: 12),

            // --- TIME PICKER ---
            InkWell(
              onTap: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: widget.viewModel.selectedTime,
                );
                if (picked != null) {
                  widget.viewModel.updateTime(picked);
                }
              },
              borderRadius: BorderRadius.circular(4),
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: "Time",
                  prefixIcon: Icon(Icons.access_time),
                  border: OutlineInputBorder(),
                ),
                child: Text(
                  widget.viewModel.selectedTime.format(context),
                  style: const TextStyle(fontSize: 16),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // --- DROPDOWNS ---
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<TypeOfEventEnum>(
                    initialValue: widget.viewModel.selectedType,
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
                    onChanged: (v) {
                      if (v != null) widget.viewModel.updateType(v);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<SpecialityEventEnum>(
                    initialValue: widget.viewModel.selectedSpeciality,
                    decoration: const InputDecoration(
                      labelText: "Speciality",
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                    ),
                    isExpanded: true,
                    items: SpecialityEventEnum.values.map((e) {
                      return DropdownMenuItem(
                        value: e,
                        child: Text(
                          e.name.toUpperCase(),
                          style: const TextStyle(fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                    onChanged: (v) {
                      if (v != null) widget.viewModel.updateSpeciality(v);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // --- ATTACH BUTTONS ---
            const Text("Attach File", style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                buildAttachButton(Icons.picture_as_pdf, "PDF", widget.viewModel.pickPDF),
                buildAttachButton(Icons.image, "Image", widget.viewModel.pickImage),
                buildAttachButton(Icons.camera_alt, "Scan", widget.viewModel.scanDocument),
              ],
            ),

            // --- SELECTED FILE PREVIEW ---
            if (widget.viewModel.filePath != null) ...[
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
                    Icon(
                      widget.viewModel.isPdf ? Icons.picture_as_pdf : Icons.image,
                      color: Colors.blue,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.viewModel.filePath!.split('/').last,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: widget.viewModel.clearFile,
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 24),

            // --- SAVE BUTTON (UPDATED) ---
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: () async {
                  // 1. Validation
                  if (!widget.viewModel.isValid) {
                    Fluttertoast.showToast(msg: "Please provide a title and select a file.");
                    return;
                  }

                  // 2. CALL THE PROVIDER (Not the ViewModel)
                  // We extract the data from the ViewModel and pass it to the Provider
                  final success = await context.read<DocumentProvider>().addDocument(
                    title: widget.viewModel.title,
                    summary: widget.viewModel.summary,
                    details: widget.viewModel.details,
                    isPdf: widget.viewModel.isPdf,
                    tempFilePath: widget.viewModel.filePath!,
                    time: widget.viewModel.selectedTime,
                    type: widget.viewModel.selectedType,
                    speciality: widget.viewModel.selectedSpeciality,
                  );

                  // 3. Handle Success
                  if (success && context.mounted) {
                    Navigator.pop(context); // Close the sheet
                    Fluttertoast.showToast(msg: "Document Saved Successfully");
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                // Show loading spinner from Provider state
                child: docProvider.isLoading
                    ? const SizedBox(
                        height: 24, 
                        width: 24, 
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)
                      )
                    : const Text("Save Document", style: TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
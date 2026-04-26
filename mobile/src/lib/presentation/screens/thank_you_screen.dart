import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/models/doctors.dart';
import '../../domain/models/document.dart';
import '../widgets/attach_file.dart';
import '../viewmodels/add_document_viewmodel.dart';
import '../viewmodels/booking_provider.dart';
import 'select_patient_documents_screen.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:sensors_plus/sensors_plus.dart';

class ThankYouScreen extends StatefulWidget {
  final String appointmentId;
  final Doctor doctor;
  final String appointmentDate;
  final String appointmentTime;
  final int fees;
  final DocumentAddViewModel viewModel;

  const ThankYouScreen({
    super.key,
    required this.appointmentId,
    required this.doctor,
    required this.appointmentDate,
    required this.appointmentTime,
    required this.fees,
    required this.viewModel,
  });

  @override
  State<ThankYouScreen> createState() => _ThankYouScreenState();
}

class _ThankYouScreenState extends State<ThankYouScreen> {
  // Controller for the Date Field
  final TextEditingController _dobController = TextEditingController();
  final TextEditingController _symptomsController = TextEditingController();

  // Variable for Dropdown selection
  String? _selectedGender;
  List<DocumentModel> _selectedDocuments = [];

  // Function to Open the Calendar
  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(), // Focus on today
      firstDate: DateTime(1900), // Oldest valid date
      lastDate: DateTime.now(), // Max date is today
    );
    if (picked != null) {
      setState(() {
        // Format: Day/Month/Year (e.g., 20/1/2026)
        _dobController.text = "${picked.day}/${picked.month}/${picked.year}";
      });
    }
  }

  @override
  void dispose() {
    _dobController.dispose();
    _symptomsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(
        title: const Text("Thank You"),
        backgroundColor: const Color(0xFF0073CF),
        elevation: 0,
        // Remove back button if you don't want them to go back to "Confirm"
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () {
            // Navigate back to Home (pop until first route)
            Navigator.of(context).popUntil((route) => route.isFirst);
          },
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // --- 1. SUCCESS HEADER ---
            Container(
              color: Colors.white,
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 30),
              child: Column(
                children: [
                  Container(
                    height: 80,
                    width: 80,
                    decoration: const BoxDecoration(
                      color: Color(0xFF66BB6A), // Success Green
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check,
                      color: Colors.white,
                      size: 50,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "Your booking is successful",
                    style: TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "Doctor ${widget.doctor.name}",
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4A4A4A),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // --- 2. APPOINTMENT DETAILS CARD ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildDetailRow(
                    Icons.calendar_month_outlined,
                    widget.appointmentTime, // e.g. 06:35 PM : 09:50 PM
                    subtitle: widget.appointmentDate, // e.g. Sunday 18 January
                  ),
                  const Divider(height: 24),
                  _buildDetailRow(
                    Icons.location_on_outlined,
                    widget.doctor.address,
                    linkText: "Check the map",
                  ),
                  const Divider(height: 24),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // --- 3. PAYMENT & TOTAL ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Payment Method",
                        style: TextStyle(color: Colors.grey),
                      ),
                      Icon(Icons.money, color: Colors.blue.shade700),
                    ],
                  ),
                  const Divider(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Order Amount",
                        style: TextStyle(fontWeight: FontWeight.w500),
                      ),
                      Text(
                        "${widget.fees} EGP",
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Sub Total",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        "${widget.fees} EGP",
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // --- 4. NOTES FORM (OPTIONAL) ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Notes for the doctor (optional)",
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Age & Gender Row
                  Row(
                    children: [
                      // --- 1. DATE OF BIRTH (CALENDAR) ---
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              "Date of Birth",
                              style: TextStyle(fontSize: 12),
                            ),
                            TextFormField(
                              controller: _dobController,
                              readOnly:
                                  true, // <--- Disables typing, forces Calendar
                              onTap: () =>
                                  _selectDate(context), // <--- Opens Calendar
                              decoration: const InputDecoration(
                                hintText: "DD/MM/YYYY",
                                hintStyle: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey,
                                ),
                                suffixIcon: Icon(
                                  Icons.calendar_month,
                                  size: 18,
                                  color: Colors.grey,
                                ),
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                border: UnderlineInputBorder(),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(width: 16), // Safe spacing
                      // --- 2. GENDER (DROPDOWN) ---
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              "Gender",
                              style: TextStyle(fontSize: 12),
                            ),
                            DropdownButtonFormField<String>(
                              initialValue: _selectedGender,
                              hint: const Text(
                                "Select",
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey,
                                ),
                              ),
                              icon: const Icon(
                                Icons.keyboard_arrow_down,
                                color: Colors.grey,
                              ),
                              isExpanded:
                                  true, // <--- Prevents overflow inside the dropdown
                              decoration: const InputDecoration(
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                border: UnderlineInputBorder(),
                              ),
                              items: ['Male', 'Female'].map((String value) {
                                return DropdownMenuItem<String>(
                                  value: value,
                                  child: Text(
                                    value,
                                    style: const TextStyle(fontSize: 13),
                                  ),
                                );
                              }).toList(),
                              onChanged: (String? newValue) {
                                setState(() {
                                  _selectedGender = newValue;
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Symptoms Input
                  const Text("Symptoms", style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _symptomsController,
                    decoration: InputDecoration(
                      hintText: "e.g. cough, back pain, etc.",
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Attach Files
                  const Text("Documents", style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 4),
                  const Text(
                    "Use images or PDF files",
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  // Attach File Buttons
                  const Text(
                    "Attach File",
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      buildAttachButton(
                        Icons.picture_as_pdf,
                        "PDF",
                        widget.viewModel.pickPDF,
                      ),
                      buildAttachButton(
                        Icons.image,
                        "Image",
                        widget.viewModel.pickImage,
                      ),
                      buildAttachButton(
                        Icons.camera_alt,
                        "Scan",
                        widget.viewModel.scanDocument,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final selected = await Navigator.of(context)
                          .push<List<DocumentModel>>(
                            MaterialPageRoute(
                              builder: (_) => SelectPatientDocumentsScreen(
                                initiallySelected: _selectedDocuments,
                              ),
                            ),
                          );

                      if (!mounted || selected == null) return;
                      setState(() {
                        _selectedDocuments = selected;
                      });
                    },
                    icon: const Icon(Icons.folder_open),
                    label: const Text('Select from patient documents'),
                  ),
                  if (_selectedDocuments.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _selectedDocuments
                          .map(
                            (doc) => Chip(
                              label: Text(
                                doc.title,
                                overflow: TextOverflow.ellipsis,
                              ),
                              avatar: Icon(
                                doc.isPDF ? Icons.picture_as_pdf : Icons.image,
                                size: 16,
                                color: doc.isPDF ? Colors.red : Colors.blue,
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
//                         () => widget.viewModel.scanDocument(context),
//                       ),
                      // The Enhanced Scan Button
                      // StreamBuilder<AccelerometerEvent>(
                      //   stream: accelerometerEventStream(),
                      //   builder: (context, snapshot) {
                      //     double x = snapshot.data?.x ?? 0;
                      //     double y = snapshot.data?.y ?? 0;

                      //     // Define "Level" (Usually between -0.5 and 0.5 for a flat surface)
                      //     bool isLevel = x.abs() < 0.6 && y.abs() < 0.6;

                      //     return Column(
                      //       children: [
                      //         // The Level Bubble indicator above the button
                      //         Container(
                      //           width: 40,
                      //           height: 40,
                      //           decoration: BoxDecoration(
                      //             shape: BoxShape.circle,
                      //             border: Border.all(
                      //               color: isLevel ? Colors.green : Colors.grey,
                      //             ),
                      //           ),
                      //           child: Center(
                      //             child: Transform.translate(
                      //               offset: Offset(
                      //                 x * 2,
                      //                 y * 2,
                      //               ), // Move bubble based on tilt
                      //               child: Icon(
                      //                 Icons.circle,
                      //                 size: 12,
                      //                 color: isLevel
                      //                     ? Colors.green
                      //                     : Colors.redAccent,
                      //               ),
                      //             ),
                      //           ),
                      //         ),
                      //         const SizedBox(height: 4),
                      //         buildAttachButton(
                      //           Icons.camera_alt,
                      //           isLevel ? "Scan Now" : "Level Phone",
                      //           isLevel
                      //               ? widget.viewModel.scanDocument
                      //               : () {
                      //                   Fluttertoast.showToast(
                      //                     msg:
                      //                         "Please hold phone flat over the document",
                      //                   );
                      //                 },
                      //         ),
                      //       ],
                      //     );
                      //   },
                      // ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // --- 5. SEND BUTTON ---
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: ElevatedButton(
                onPressed: () async {
                  final symptoms = _symptomsController.text.trim();

                  final noteParts = <String>[];
                  if (_dobController.text.trim().isNotEmpty) {
                    noteParts.add('DOB: ${_dobController.text.trim()}');
                  }
                  if (_selectedGender != null && _selectedGender!.isNotEmpty) {
                    noteParts.add('Gender: $_selectedGender');
                  }

                  final doctorNote = noteParts.join(' | ');
                  final selectedDocumentIds = _selectedDocuments
                      .map((doc) => doc.serverId)
                      .whereType<String>()
                      .where((id) => id.trim().isNotEmpty)
                      .toList();

                  final selectedDocumentTitles = _selectedDocuments
                      .map((doc) => doc.title)
                      .where((title) => title.trim().isNotEmpty)
                      .toList();

                  final composedDoctorNote = [
                    if (doctorNote.isNotEmpty) doctorNote,
                    if (selectedDocumentTitles.isNotEmpty)
                      'Selected documents: ${selectedDocumentTitles.join(', ')}',
                  ].join(' | ');

                  final sent = await context
                      .read<BookingProvider>()
                      .sendNotesToDoctor(
                        appointmentId: widget.appointmentId,
                        symptomsText: symptoms.isEmpty ? null : symptoms,
                        doctorNote: composedDoctorNote.isEmpty
                            ? null
                            : composedDoctorNote,
                        documentReferenceIds: selectedDocumentIds,
                      );

                  if (!context.mounted) return;

                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        sent ? "Notes Sent!" : "Failed to send notes",
                      ),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor:
                      Colors.grey.shade600, // Grey button as per image
                  minimumSize: const Size(double.infinity, 50),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text(
                  "Send to the doctor",
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  // --- HELPER WIDGETS ---

  Widget _buildDetailRow(
    IconData icon,
    String title, {
    String? subtitle,
    String? linkText,
    Color? iconColor,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: iconColor ?? const Color(0xFF0073CF), size: 28),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.grey, fontSize: 13),
                ),
              ],
              if (linkText != null) ...[
                const SizedBox(height: 4),
                Text(
                  linkText,
                  style: const TextStyle(
                    color: Color(0xFF0073CF),
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

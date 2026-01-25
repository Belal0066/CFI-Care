import 'package:flutter/material.dart';
import '../domain/models/document.dart';
import 'package:gal/gal.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:media_scanner/media_scanner.dart';
import '../utils/enums/type_of_event.dart';
import '../utils/enums/speciality_event.dart';

// Controllers
final titleController = TextEditingController();
final summaryController = TextEditingController();
final detailsController = TextEditingController();

// State Variables
String? filePath;
bool isPDF = false;
TimeOfDay selectedTime = const TimeOfDay(hour: 0, minute: 0);
TypeOfEventEnum selectedType = TypeOfEventEnum.other;
SpecialityEventEnum selectedSpeciality = SpecialityEventEnum.other;

// --- Save Logic ---
Future<DocumentModel> saveDocument() async {
  // 1. Validation
  if (titleController.text.isEmpty || filePath == null) {
    throw const FormatException("Please provide a title and select a file.");
  }

  String publicPath;

  // --- Generate Filename from Title ---

  // 1. Get the file extension (pdf, jpg, png, etc.)
  String extension = filePath!.split('.').last;

  // 2. Sanitize the title to remove illegal characters (like / : * ? " < > |)
  // We replace them with an underscore or empty string to prevent crashes.
  String safeTitle = titleController.text.trim().replaceAll(
    RegExp(r'[\\/:*?"<>|]'),
    '_',
  );

  // 3. Create the final filename
  String fileName = '$safeTitle.$extension';

  if (isPDF) {
    // --- LOGIC FOR PDF (File Manager) ---
    final directory = Directory('/storage/emulated/0/Download/CFICareDocs');

    if (!await directory.exists()) {
      await directory.create(recursive: true);
    }

    // Use the new 'fileName' here instead of the old path
    final newFile = File('${directory.path}/$fileName');

    // Copy the file to the new location with the new name
    await File(filePath!).copy(newFile.path);
    publicPath = newFile.path;

    // Notify Media Scanner about the new file
    try {
          // Tell Android to scan this specific file so it appears in Pickers/Recents
          await MediaScanner.loadMedia(path: publicPath);
        } catch (e) {
          debugPrint("Failed to scan file: $e");
        }
  } else {
    // --- LOGIC FOR IMAGES (Gallery) ---

    // Note: Gallery apps often ignore filenames and sort by Date,
    // but we can try to rename the temp file before saving to Gal
    // if you want the internal metadata to match.

    // Create a temporary file with the correct name in the app cache first
    final appDir = await getApplicationDocumentsDirectory();
    final renamedTempFile = await File(
      filePath!,
    ).copy('${appDir.path}/$fileName');

    // Save the renamed file to Gallery
    await Gal.putImage(renamedTempFile.path, album: 'CFI Care');

    publicPath = renamedTempFile.path;
  }

  // 4. Create the document object
  return DocumentModel(
    title: titleController.text,
    filePath: filePath!, // Keeping internal reference
    isPDF: isPDF,
    summary: summaryController.text,
    details: detailsController.text,
    time: selectedTime,
    type: selectedType,
    speciality: selectedSpeciality,
  );
}

import 'package:flutter/material.dart';
import '../../utils/enums/speciality_event.dart';
import '../../utils/enums/type_of_event.dart';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_doc_scanner/flutter_doc_scanner.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:fluttertoast/fluttertoast.dart';
import '../../data/services/permission_handler_widget.dart';

class DocumentAddViewModel extends ChangeNotifier {

  final ImagePicker _imagePicker;
  final FilePicker _filePicker;

  // Constructor Injection
  DocumentAddViewModel({
    ImagePicker? imagePicker, 
    FilePicker? filePicker
  }) : _imagePicker = imagePicker ?? ImagePicker(),
       _filePicker = filePicker ?? FilePicker.platform;

  // --- Fields ---
  String _title = '';
  String get title => _title;
  void setTitle(String value) {
    _title = value;
    notifyListeners();
  }

  String _summary = '';
  String get summary => _summary;
  void setSummary(String value) {
    _summary = value;
    notifyListeners();
  }

  String _details = '';
  String get details => _details;
  void setDetails(String value) {
    _details = value;
    notifyListeners();
  }

  // File State
  String? filePath;
  bool isPdf = false;

  // Enums / Time
  TimeOfDay selectedTime = TimeOfDay.now();
  TypeOfEventEnum selectedType = TypeOfEventEnum.other;
  SpecialityEventEnum selectedSpeciality = SpecialityEventEnum.other;

  // Validation
  bool get isValid => _title.isNotEmpty && filePath != null;

  Future<void> _copyFileToAppDir(
    String originalPath, {
    required bool isPDF,
  }) async {
    final file = File(originalPath);
    if (!file.existsSync()) return;

    final appDir = await getApplicationDocumentsDirectory();
    final newPath =
        '${appDir.path}/${DateTime.now().millisecondsSinceEpoch}_${file.path.split('/').last}';
    final newFile = await file.copy(newPath);

    filePath = newFile.path;
    isPdf = isPDF;
    notifyListeners();
  }

  Future<void> pickPDF() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
    );
    if (result != null && result.files.single.path != null) {
      await _copyFileToAppDir(result.files.single.path!, isPDF: true);
    }
  }

  Future<void> pickImage() async {
    // final picker = ImagePicker();
    // final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    final pickedFile = await _imagePicker.pickImage(source: ImageSource.gallery);
    if (pickedFile != null) {
      await _copyFileToAppDir(pickedFile.path, isPDF: false);
    }
  }

  Future<void> scanDocument() async {
    // Note: ensure your handlePermission function is imported correctly
    final hasPermission = await handlePermission(Permission.camera, "Camera");
    if (!hasPermission) return;

    try {
      final scanner = FlutterDocScanner();
      final scanned = await scanner.getScannedDocumentAsPdf(page: 4);

      if (scanned != null && scanned['pdfUri'] != null) {
        String path = scanned['pdfUri'].toString().replaceFirst("file://", "");

        await _copyFileToAppDir(path, isPDF: true);
      }
    } catch (e) {
      Fluttertoast.showToast(msg: "Scan failed: $e");
    }
  }

  void clearFile() {
    filePath = null;
    notifyListeners();
  }

  // setters for Dropdowns/Time Picker
  void updateType(TypeOfEventEnum type) {
    selectedType = type;
    notifyListeners();
  }

  void updateSpeciality(SpecialityEventEnum speciality) {
    selectedSpeciality = speciality;
    notifyListeners();
  }

  void updateTime(TimeOfDay time) {
    selectedTime = time;
    notifyListeners();
  }
}

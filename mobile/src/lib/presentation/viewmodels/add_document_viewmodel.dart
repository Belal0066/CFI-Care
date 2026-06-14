import 'package:flutter/material.dart';
import '../../utils/enums/speciality_event.dart';
import '../../utils/enums/type_of_event.dart';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
// import 'package:flutter_doc_scanner/flutter_doc_scanner.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:fluttertoast/fluttertoast.dart';
import '../../data/services/permission_handler_widget.dart';
import '../../data/services/image_quality_service.dart';
import '../widgets/scanner_with_spirit_level.dart';
import '../widgets/multiple_page_scanner.dart';


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

  // Image Quality State
  bool _isCheckingBlur = false;
  bool _isApplyingFilter = false;
  bool _isBlurry = false;
  double? _blurScore;
  String? _filterError;

  bool get isCheckingBlur => _isCheckingBlur;
  bool get isApplyingFilter => _isApplyingFilter;
  bool get isBlurry => _isBlurry;
  double? get blurScore => _blurScore;
  String? get filterError => _filterError;

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
    final pickedFile = await _imagePicker.pickImage(source: ImageSource.gallery);
    if (pickedFile == null) return;

    await _copyFileToAppDir(pickedFile.path, isPDF: false);
    await _runBlurCheck();
  }

  Future<void> takePhoto() async {
    final pickedFile = await _imagePicker.pickImage(source: ImageSource.camera);
    if (pickedFile == null) return;

    await _copyFileToAppDir(pickedFile.path, isPDF: false);
    await _runBlurCheck();
  }

  // Shared blur detection — called right after any image is captured or picked.
  Future<void> _runBlurCheck() async {
    if (filePath == null) return;

    _isCheckingBlur = true;
    _isBlurry = false;
    _blurScore = null;
    _filterError = null;
    notifyListeners();

    _blurScore = await ImageQualityService.computeBlurScore(filePath!);
    _isBlurry = (_blurScore ?? 999) < ImageQualityService.blurThreshold;
    _isCheckingBlur = false;
    notifyListeners();
  }

  /// Replaces the current image with a magic-filtered (auto-enhanced) version.
  Future<void> applyMagicFilter() async {
    if (filePath == null || isPdf) return;

    _isApplyingFilter = true;
    _filterError = null;
    notifyListeners();

    try {
      final enhancedPath = await ImageQualityService.applyMagicFilter(filePath!);
      filePath = enhancedPath;

      // Re-check blur score on the enhanced image
      _blurScore = await ImageQualityService.computeBlurScore(filePath!);
      _isBlurry = (_blurScore ?? 999) < ImageQualityService.blurThreshold;
    } catch (e) {
      _filterError = 'Enhancement failed: $e';
    } finally {
      _isApplyingFilter = false;
      notifyListeners();
    }
  }

  // Future<void> scanDocument() async {
  //   final hasPermission = await handlePermission(Permission.camera, "Camera");
  //   if (!hasPermission) return;

  //   try {
  //     final scanner = FlutterDocScanner();
  //     final scanned = await scanner.getScannedDocumentAsPdf(page: 4);

  //     if (scanned != null && scanned['pdfUri'] != null) {
  //       String path = scanned['pdfUri'].toString().replaceFirst("file://", "");

  //       await _copyFileToAppDir(path, isPDF: true);
  //     }
  //   } catch (e) {
  //     Fluttertoast.showToast(msg: "Scan failed: $e");
  //   }
  // }

Future<void> scanDocument(BuildContext context) async {
    final hasPermission = await handlePermission(Permission.camera, "Camera");
    if (!hasPermission) return;

    try {
      final String? resultPath = await Navigator.push(
        context,
        MaterialPageRoute(builder: (context) => const MultiPageScanner()),
      );

      if (resultPath != null) {
        await _copyFileToAppDir(resultPath, isPDF: true);
        // Scanned documents are PDFs — no blur check needed for PDFs.
        // If the scanner ever returns a JPEG instead, swap isPDF to false
        // in _copyFileToAppDir and call _runBlurCheck() here.
      }
    } catch (e) {
      Fluttertoast.showToast(msg: "Scan failed: $e");
    }
}

  void clearFile() {
    filePath = null;
    _isBlurry = false;
    _blurScore = null;
    _filterError = null;
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

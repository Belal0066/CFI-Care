import 'dart:async';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:pdf/pdf.dart';

class MultiPageScanner extends StatefulWidget {
  const MultiPageScanner({super.key});

  @override
  State<MultiPageScanner> createState() => _MultiPageScannerState();
}

class _MultiPageScannerState extends State<MultiPageScanner> {
  CameraController? _controller;
  StreamSubscription? _subscription;
  List<String> _scannedPages = [];
  double x = 0, y = 0;
  bool isLevel = false;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
    _initSensors();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        debugPrint("DEBUG: No cameras found on device.");
        return;
      }

      _controller = CameraController(
        cameras.first,
        ResolutionPreset
            .high, // High is safer for memory than Max during PDF generation
        enableAudio: false,
      );

      await _controller!.initialize();
      debugPrint(
        "DEBUG: Camera Initialized. Preview Size: ${_controller!.value.previewSize}",
      );
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint("DEBUG: Camera Init Error: $e");
    }
  }

  void _initSensors() {
    _subscription = accelerometerEvents.listen((event) {
      if (!mounted || _isProcessing) return;
      if ((event.x - x).abs() < 0.1 && (event.y - y).abs() < 0.1) return;

      setState(() {
        x = event.x;
        y = event.y;
        isLevel = x.abs() < 0.7 && y.abs() < 0.7;
      });
    });
  }

  Future<void> _capturePage() async {
    if (_controller == null || _isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      // Capture at HIGH (1080p), not MAX
      final XFile photo = await _controller!.takePicture();

      if (!mounted) return;

      // Crop with compression
      final CroppedFile? croppedFile = await ImageCropper().cropImage(
        sourcePath: photo.path,
        compressQuality: 80,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Align Document Corners',
            toolbarColor: Colors.black,
            toolbarWidgetColor: Colors.greenAccent,
            activeControlsWidgetColor: Colors.greenAccent,

            // --- CRITICAL FIXES FOR MOVING EDGES ---
            lockAspectRatio: false, // Allows free movement of all 4 sides
            initAspectRatio:
                CropAspectRatioPreset.original, // Starts at full image
            hideBottomControls: false, // Shows the ratio/rotate tools
            showCropGrid: true, // Helps the user see the alignment
          ),
          IOSUiSettings(
            title: 'Align Document Corners',
            aspectRatioPickerButtonHidden: false,
            resetButtonHidden: false,
            aspectRatioLockEnabled: false, // Essential for iOS freedom
          ),
        ],
      );

      if (croppedFile != null && mounted) {
        setState(() {
          _scannedPages.add(croppedFile.path);
        });
        // 3. IMPORTANT: Delete the original massive uncropped photo
        final tempFile = File(photo.path);
        if (await tempFile.exists()) {
          await tempFile.delete();
        }
      }
    } catch (e) {
      debugPrint("DEBUG: Capture Error: $e");
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _generatePdfAndFinish() async {
    if (_scannedPages.isEmpty || _isProcessing) return;

    setState(() => _isProcessing = true);
    debugPrint(
      "DEBUG: Starting PDF Generation for ${_scannedPages.length} pages",
    );

    try {
      final pdf = pw.Document();

      for (int i = 0; i < _scannedPages.length; i++) {
        final path = _scannedPages[i];
        debugPrint("DEBUG: Processing page $i: $path");

        final file = File(path);
        if (!await file.exists()) {
          debugPrint("DEBUG: ERROR - File does not exist at $path");
          continue;
        }

        final bytes = await file.readAsBytes();
        final image = pw.MemoryImage(bytes);

        pdf.addPage(
          pw.Page(
            // Force a zero-margin format
            pageFormat: PdfPageFormat.a4.copyWith(
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              marginTop: 0,
            ),
            build: (pw.Context context) {
              return pw.FullPage(
                ignoreMargins: true,
                // Using BoxFit.contain ensures the whole image shows without a white "box" border
                child: pw.Center(
                  child: pw.Image(image, fit: pw.BoxFit.contain),
                ),
              );
            },
          ),
        );
      }

      final dir =
          await getTemporaryDirectory(); // Changed to Temporary for better permission handling
      final filePath =
          '${dir.path}/scan_${DateTime.now().millisecondsSinceEpoch}.pdf';
      final pdfFile = File(filePath);

      final pdfBytes = await pdf.save();
      await pdfFile.writeAsBytes(pdfBytes);

      debugPrint("DEBUG: PDF Saved Successfully at $filePath");
      debugPrint("DEBUG: PDF File Size: ${await pdfFile.length()} bytes");

      if (!mounted) return;
      Navigator.pop(context, filePath);
    } catch (e) {
      debugPrint('DEBUG: PDF CRITICAL ERROR: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null || !_controller!.value.isInitialized) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // FIXED ZOOM LOGIC
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                // Use the controller's preview size to define the box dimensions
                width: _controller!.value.previewSize!.height,
                height: _controller!.value.previewSize!.width,
                child: CameraPreview(_controller!),
              ),
            ),
          ),

          // Level UI
          Center(
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isLevel ? Colors.greenAccent : Colors.white24,
                  width: 2,
                ),
              ),
              child: Center(
                child: Transform.translate(
                  offset: Offset(x * 4, y * 4),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: isLevel ? Colors.greenAccent : Colors.redAccent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ),
          ),

          // UI CONTROLS
          Positioned(
            bottom: 40,
            left: 20,
            right: 20,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildCounter(),
                _buildCaptureButton(),
                _buildDoneButton(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCounter() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Colors.white10,
        shape: BoxShape.circle,
      ),
      child: Text(
        "${_scannedPages.length}",
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildCaptureButton() {
    return GestureDetector(
      onTap: _capturePage,
      child: Container(
        height: 80,
        width: 80,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 4),
        ),
        child: _isProcessing
            ? const Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2,
                ),
              )
            : const Icon(Icons.camera_alt, color: Colors.white, size: 40),
      ),
    );
  }

  Widget _buildDoneButton() {
    return IconButton(
      onPressed: _scannedPages.isNotEmpty ? _generatePdfAndFinish : null,
      icon: Icon(
        Icons.check_circle,
        color: _scannedPages.isNotEmpty ? Colors.greenAccent : Colors.white10,
        size: 50,
      ),
    );
  }
}

import 'dart:async';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:pdf/pdf.dart';
import '../../data/services/image_quality_service.dart';

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

  // Blur check state — reset after each capture decision
  bool _isCheckingBlur = false;
  bool _lastPageBlurry = false;
  String? _pendingPagePath;    // cropped path waiting for user decision
  bool _isEnhancing = false;
  String? _enhancedPagePath;   // result of magic filter, shown for preview

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
    if (_controller == null || _isProcessing || _pendingPagePath != null) return;
    setState(() => _isProcessing = true);

    try {
      final XFile photo = await _controller!.takePicture();
      if (!mounted) return;

      final CroppedFile? croppedFile = await ImageCropper().cropImage(
        sourcePath: photo.path,
        compressQuality: 80,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Align Document Corners',
            toolbarColor: Colors.black,
            toolbarWidgetColor: Colors.greenAccent,
            activeControlsWidgetColor: Colors.greenAccent,
            lockAspectRatio: false,
            initAspectRatio: CropAspectRatioPreset.original,
            hideBottomControls: false,
            showCropGrid: true,
          ),
          IOSUiSettings(
            title: 'Align Document Corners',
            aspectRatioPickerButtonHidden: false,
            resetButtonHidden: false,
            aspectRatioLockEnabled: false,
          ),
        ],
      );

      // Delete original uncropped photo
      final tempFile = File(photo.path);
      if (await tempFile.exists()) await tempFile.delete();

      if (croppedFile == null || !mounted) return;

      // --- BLUR CHECK ---
      setState(() {
        _isProcessing = false;
        _isCheckingBlur = true;
        _pendingPagePath = croppedFile.path;
      });

      final score = await ImageQualityService.computeBlurScore(croppedFile.path);
      final blurry = (score ?? 999) < ImageQualityService.blurThreshold;

      if (mounted) {
        setState(() {
          _isCheckingBlur = false;
          _lastPageBlurry = blurry;
        });
      }
    } catch (e) {
      debugPrint("DEBUG: Capture Error: $e");
      if (mounted) setState(() => _isProcessing = false);
    } finally {
      if (mounted && _isProcessing) setState(() => _isProcessing = false);
    }
  }

  /// Patient accepts the original page.
  void _keepPage() {
    if (_pendingPagePath == null) return;
    setState(() {
      _scannedPages.add(_pendingPagePath!);
      _pendingPagePath = null;
      _lastPageBlurry = false;
    });
    // Clean up any enhanced copy that was not chosen
    if (_enhancedPagePath != null) {
      File(_enhancedPagePath!).delete().ignore();
      _enhancedPagePath = null;
    }
  }

  /// Runs magic filter on the pending page and stores the result for preview.
  Future<void> _enhancePage() async {
    if (_pendingPagePath == null || _isEnhancing) return;
    setState(() => _isEnhancing = true);
    try {
      final enhanced =
          await ImageQualityService.applyMagicFilter(_pendingPagePath!);
      if (mounted) setState(() => _enhancedPagePath = enhanced);
    } catch (e) {
      debugPrint('DEBUG: Enhance error: $e');
    } finally {
      if (mounted) setState(() => _isEnhancing = false);
    }
  }

  /// Patient keeps the enhanced version.
  void _keepEnhanced() {
    if (_enhancedPagePath == null) return;
    // Delete original blurry scan, keep enhanced
    if (_pendingPagePath != null) {
      File(_pendingPagePath!).delete().ignore();
    }
    setState(() {
      _scannedPages.add(_enhancedPagePath!);
      _enhancedPagePath = null;
      _pendingPagePath = null;
      _lastPageBlurry = false;
    });
  }

  /// Patient discards everything and retakes.
  Future<void> _retakePage() async {
    final original = _pendingPagePath;
    final enhanced = _enhancedPagePath;
    setState(() {
      _pendingPagePath = null;
      _enhancedPagePath = null;
      _lastPageBlurry = false;
    });
    Future<void> tryDelete(String path) async {
      try { await File(path).delete(); } catch (_) {}
    }
    if (original != null) await tryDelete(original);
    if (enhanced != null) await tryDelete(enhanced);
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

          // ENHANCED IMAGE FULL-SCREEN PREVIEW
          if (_enhancedPagePath != null)
            _buildEnhancedPreview(),

          // BLUR RESULT BANNER — appears right after capture (hidden during enhanced preview)
          if (_enhancedPagePath == null &&
              (_isCheckingBlur || _pendingPagePath != null))
            Positioned(
              bottom: 140,
              left: 20,
              right: 20,
              child: _buildBlurResultBanner(),
            ),
        ],
      ),
    );
  }

  Widget _buildBlurResultBanner() {
    // Still running the check
    if (_isCheckingBlur) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(
          children: [
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2,
              ),
            ),
            SizedBox(width: 12),
            Text(
              'Checking image quality…',
              style: TextStyle(color: Colors.white, fontSize: 14),
            ),
          ],
        ),
      );
    }

    // Check complete — sharp page
    if (!_lastPageBlurry) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.green.shade700,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 20),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'Page looks sharp!',
                style: TextStyle(color: Colors.white, fontSize: 14,
                    fontWeight: FontWeight.w500),
              ),
            ),
            ElevatedButton(
              onPressed: _keepPage,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.green.shade700,
              ),
              child: const Text('Next Page'),
            ),
          ],
        ),
      );
    }

    // Check complete — blurry page
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.orange.shade800,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Page looks blurry.',
                  style: TextStyle(color: Colors.white, fontSize: 14,
                      fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              // Retake
              Expanded(
                child: OutlinedButton(
                  onPressed: _retakePage,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white70),
                  ),
                  child: const Text('Retake'),
                ),
              ),
              const SizedBox(width: 8),
              // Auto-Enhance
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isEnhancing ? null : _enhancePage,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.orange.shade800,
                  ),
                  icon: _isEnhancing
                      ? SizedBox(
                          width: 14, height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.orange.shade800,
                          ),
                        )
                      : const Icon(Icons.auto_fix_high, size: 16),
                  label: Text(_isEnhancing ? 'Enhancing…' : 'Auto-Enhance'),
                ),
              ),
              const SizedBox(width: 8),
              // Keep blurry
              Expanded(
                child: OutlinedButton(
                  onPressed: _keepPage,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white70),
                  ),
                  child: const Text('Keep'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Full-screen overlay showing the enhanced image so the patient can decide.
  Widget _buildEnhancedPreview() {
    return Positioned.fill(
      child: Container(
        color: Colors.black,
        child: Column(
          children: [
            // Header
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    const Icon(Icons.auto_fix_high,
                        color: Colors.greenAccent, size: 20),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Enhanced Preview',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const Text(
                      'Does it look better?',
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),

            // Enhanced image
            Expanded(
              child: InteractiveViewer(
                child: Image.file(
                  File(_enhancedPagePath!),
                  fit: BoxFit.contain,
                  width: double.infinity,
                ),
              ),
            ),

            // Action buttons
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                child: Row(
                  children: [
                    // Retake — throw away everything
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _retakePage,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        icon: const Icon(Icons.replay, size: 16),
                        label: const Text('Retake'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Keep enhanced
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed: _keepEnhanced,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.greenAccent,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        icon: const Icon(Icons.check, size: 16),
                        label: const Text('Keep Enhanced',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
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

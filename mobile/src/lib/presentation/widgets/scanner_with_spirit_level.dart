import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:flutter/services.dart';
import '../widgets/screen_preview_screen.dart';

class DocumentScannerWithLevel extends StatefulWidget {
  const DocumentScannerWithLevel({super.key});

  @override
  State<DocumentScannerWithLevel> createState() => _DocumentScannerWithLevelState();
}

class _DocumentScannerWithLevelState extends State<DocumentScannerWithLevel> {
  CameraController? _controller;
  StreamSubscription<AccelerometerEvent>? _subscription;
  
  double x = 0, y = 0;
  bool isLevel = false;
  bool _isCapturing = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
    _initSensors();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    if (cameras.isEmpty) return;
    
    _controller = CameraController(
      cameras.first, 
      ResolutionPreset.max, // Highest resolution for OCR
      enableAudio: false,
    );

    try {
      await _controller!.initialize();
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint("Camera error: $e");
    }
  }

  void _initSensors() {
    _subscription = accelerometerEvents.listen((event) {
      if (!mounted) return;
      setState(() {
        x = event.x;
        y = event.y;
        // Threshold: 0.7 is the standard for a flat document scan
        isLevel = x.abs() < 0.7 && y.abs() < 0.7;
      });
    });
  }

  Future<void> _takePicture() async {
  if (_controller == null || !_controller!.value.isInitialized || _isCapturing) return;

  setState(() => _isCapturing = true);
  
  try {
    final XFile image = await _controller!.takePicture();
    
    if (!mounted) return;

    // Open the Preview Screen and wait for the user's decision
    final bool? shouldSave = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (context) => ScannerPreviewScreen(imagePath: image.path),
      ),
    );

    if (shouldSave == true) {
      // Patient liked the photo, return the path to the ViewModel
      if (mounted) Navigator.pop(context, image.path);
    } else {
      // Patient wants to retake, just reset the capturing state
      setState(() => _isCapturing = false);
    }
  } catch (e) {
    setState(() => _isCapturing = false);
    debugPrint("Capture failed: $e");
  }
}

  @override
  void dispose() {
    _subscription?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  @override
Widget build(BuildContext context) {
  if (_controller == null || !_controller!.value.isInitialized) {
    return const Scaffold(
      backgroundColor: Colors.black, 
      body: Center(child: CircularProgressIndicator(color: Colors.greenAccent))
    );
  }

  return Scaffold(
    backgroundColor: Colors.black,
    body: LayoutBuilder(
      builder: (context, constraints) {
        // --- 1. Calculate the Scaling to fix the Zoom ---
        final double screenAspectRatio = constraints.maxWidth / constraints.maxHeight;
        double cameraAspectRatio = _controller!.value.aspectRatio;

        // On Android, the aspect ratio is often inverted (height/width)
        if (cameraAspectRatio < 1) cameraAspectRatio = 1 / cameraAspectRatio;

        // Calculate the scale to fit the camera preview without cropping
        double scale = 1 / (cameraAspectRatio * screenAspectRatio);
        if (scale < 1) scale = 1 / scale;

        return Stack(
          fit: StackFit.expand,
          children: [
            // --- 2. Corrected Camera Preview ---
            Center(
              child: Transform.scale(
                scale: scale,
                child: CameraPreview(_controller!),
              ),
            ),

            // --- 3. Overlays (Painter, Bubble, Buttons) ---
            Positioned.fill(
              child: CustomPaint(
                painter: ScannerOverlayPainter(isLevel: isLevel),
              ),
            ),

            // Spirit Level Bubble
            Center(
              child: Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white12),
                ),
                child: Center(
                  child: Transform.translate(
                    offset: Offset(x * 8, y * 8),
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: isLevel ? Colors.greenAccent : Colors.redAccent,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // Capture Button and Instruction
            Positioned(
              bottom: 40,
              left: 0,
              right: 0,
              child: _buildCaptureControls(),
            ),

            // Close Button
            Positioned(
              top: 50,
              left: 20,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 30),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        );
      },
    ),
  );
}

Widget _buildCaptureControls() {
  return Column(
    children: [
      Text(
        isLevel ? "READY TO SCAN" : "HOLD PHONE FLAT",
        style: TextStyle(
          color: isLevel ? Colors.greenAccent : Colors.white70,
          fontWeight: FontWeight.bold,
          backgroundColor: Colors.black38,
        ),
      ),
      const SizedBox(height: 20),
      GestureDetector(
        onTap: _isCapturing ? null : _takePicture,
        child: Container(
          height: 75,
          width: 75,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 4),
          ),
          child: Center(
            child: _isCapturing 
              ? const CircularProgressIndicator(color: Colors.white)
              : const Icon(Icons.camera_alt, color: Colors.white, size: 35),
          ),
        ),
      ),
    ],
  );
}
}

class ScannerOverlayPainter extends CustomPainter {
  final bool isLevel;
  ScannerOverlayPainter({required this.isLevel});

  @override
  void paint(Canvas canvas, Size size) {
    
    double frameWidth = size.width * 0.92; 
    double frameHeight = frameWidth * 1.414; // Standard A4 Aspect Ratio
    
    // SAFETY CHECK: Ensure the frame doesn't exceed 80% of the screen height
    if (frameHeight > size.height * 0.8) {
      frameHeight = size.height * 0.8;
      frameWidth = frameHeight / 1.414;
    }

    final Rect rect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: frameWidth,
      height: frameHeight,
    );

    // Darken the area outside the frame (The "Hole" effect)
    final Paint backgroundPaint = Paint()..color = Colors.black.withOpacity(0.6);
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16))),
      ),
      backgroundPaint,
    );

    // Main Frame Border
    final Paint framePaint = Paint()
      ..color = isLevel ? Colors.greenAccent : Colors.white24
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16)), framePaint);

    // Thick Corner Guides
    final Paint cornerPaint = Paint()
      ..color = isLevel ? Colors.greenAccent : Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6.0 // Made slightly thicker for better visibility
      ..strokeCap = StrokeCap.round;

    const double cl = 45.0; // Corner line length
    
    // Top Left
    canvas.drawLine(Offset(rect.left, rect.top + cl), Offset(rect.left, rect.top), cornerPaint);
    canvas.drawLine(Offset(rect.left, rect.top), Offset(rect.left + cl, rect.top), cornerPaint);
    // Top Right
    canvas.drawLine(Offset(rect.right - cl, rect.top), Offset(rect.right, rect.top), cornerPaint);
    canvas.drawLine(Offset(rect.right, rect.top), Offset(rect.right, rect.top + cl), cornerPaint);
    // Bottom Left
    canvas.drawLine(Offset(rect.left, rect.bottom - cl), Offset(rect.left, rect.bottom), cornerPaint);
    canvas.drawLine(Offset(rect.left, rect.bottom), Offset(rect.left + cl, rect.bottom), cornerPaint);
    // Bottom Right
    canvas.drawLine(Offset(rect.right - cl, rect.bottom), Offset(rect.right, rect.bottom), cornerPaint);
    canvas.drawLine(Offset(rect.right, rect.bottom), Offset(rect.right, rect.bottom - cl), cornerPaint);
  }

  @override
  bool shouldRepaint(ScannerOverlayPainter oldDelegate) => oldDelegate.isLevel != isLevel;
}
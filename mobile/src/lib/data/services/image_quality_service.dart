import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:image/image.dart' as img;

class ImageQualityService {
  // ------------------------------------------------------------------
  // BLUR DETECTION — Laplacian Variance
  // ------------------------------------------------------------------
  static const double blurThreshold = 80.0;

  /// Returns a blur score. Lower = blurrier.
  static Future<double?> computeBlurScore(String imagePath) async {
    final bytes = await File(imagePath).readAsBytes();
    final original = img.decodeImage(bytes);
    if (original == null) return null;

    final image = original.width > 600
        ? img.copyResize(original, width: 600)
        : original;

    final gray = img.grayscale(image);
    final w = gray.width;
    final h = gray.height;

    final List<double> laplacianValues = [];

    for (int y = 1; y < h - 1; y++) {
      for (int x = 1; x < w - 1; x++) {
        final center = _luma(gray, x, y);
        final top    = _luma(gray, x,     y - 1);
        final bottom = _luma(gray, x,     y + 1);
        final left   = _luma(gray, x - 1, y);
        final right  = _luma(gray, x + 1, y);

        final response = (top + bottom + left + right) - (4 * center);
        laplacianValues.add(response.toDouble());
      }
    }

    return _variance(laplacianValues);
  }

  /// Returns true when the image is considered too blurry.
  static Future<bool> isBlurry(String imagePath) async {
    final score = await computeBlurScore(imagePath);
    if (score == null) return false;
    return score < blurThreshold;
  }

  // ------------------------------------------------------------------
  // DOCUMENT SCANNING PIPELINE
  //
  //   Step 1 — Grayscale            removes colour noise
  //   Step 2 — Gaussian blur        suppresses sensor noise before threshold
  //   Step 3 — Adaptive threshold   handles uneven lighting / shadows
  //   Step 4 — Laplacian sharpening crisps text edges on the binary image
  //   Step 5 — Auto-invert          ensures black text on white background
  // ------------------------------------------------------------------
  static Future<String> applyMagicFilter(String imagePath) async {
    final bytes = await File(imagePath).readAsBytes();
    final original = img.decodeImage(bytes);
    if (original == null) return imagePath;

    // Step 1 — Grayscale
    img.Image processed = img.grayscale(original);

    // Step 2 — Gaussian blur (radius 1 = mild, just kills salt-and-pepper noise)
    processed = img.gaussianBlur(processed, radius: 1);

    // Step 3 — Adaptive threshold (local illumination correction)
    //   blockSize 21 × 21 window, subtract constant C = 10 to avoid halo around text
    processed = _adaptiveThreshold(processed, blockSize: 21, c: 10);

    // Step 4 — Laplacian sharpening (safe on binary/grayscale: R==G==B so no desaturation)
    //   Kernel:  [ 0 -1  0 ]
    //            [-1  5 -1 ]    sum = 1, so div = 1
    //            [ 0 -1  0 ]
    processed = img.convolution(
      processed,
      filter: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      div: 1,
      offset: 0,
    );

    // Step 5 — Auto-invert: if dark pixels dominate, background was dark → invert
    processed = _autoInvert(processed);

    final dir     = File(imagePath).parent.path;
    final name    = File(imagePath).uri.pathSegments.last;
    final outPath = '$dir/enhanced_$name';

    await File(outPath).writeAsBytes(_encodeByExtension(processed, outPath));
    return outPath;
  }

  // ------------------------------------------------------------------
  // ADAPTIVE THRESHOLD
  //
  // Uses a summed-area table (integral image) for O(1) per-pixel
  // local mean computation — much faster than a naive sliding window.
  // ------------------------------------------------------------------
  static img.Image _adaptiveThreshold(
    img.Image src, {
    required int blockSize,
    required int c,
  }) {
    final w    = src.width;
    final h    = src.height;
    final half = blockSize ~/ 2;

    // Integral image (SAT): size (w+1) × (h+1), row-major
    final sat = Int32List((w + 1) * (h + 1));

    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        final val = _luma(src, x, y);
        sat[(y + 1) * (w + 1) + (x + 1)] =
            val
            + sat[y       * (w + 1) + (x + 1)]
            + sat[(y + 1) * (w + 1) + x      ]
            - sat[y       * (w + 1) + x      ];
      }
    }

    final out = img.Image(width: w, height: h);

    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        final x1 = (x - half).clamp(0, w - 1);
        final y1 = (y - half).clamp(0, h - 1);
        final x2 = (x + half).clamp(0, w - 1);
        final y2 = (y + half).clamp(0, h - 1);

        final count = (x2 - x1 + 1) * (y2 - y1 + 1);
        final sum   = sat[(y2 + 1) * (w + 1) + (x2 + 1)]
                    - sat[ y1      * (w + 1) + (x2 + 1)]
                    - sat[(y2 + 1) * (w + 1) +  x1     ]
                    + sat[ y1      * (w + 1) +  x1     ];

        final mean   = sum / count;
        final pixVal = _luma(src, x, y);
        final binary = pixVal < (mean - c) ? 0 : 255;

        out.setPixelRgba(x, y, binary, binary, binary, 255);
      }
    }

    return out;
  }

  // ------------------------------------------------------------------
  // AUTO-INVERT — background normalisation
  // After adaptive threshold the dominant colour should be white (paper).
  // If more than half the pixels are dark, the image is inverted → fix it.
  // ------------------------------------------------------------------
  static img.Image _autoInvert(img.Image src) {
    int whiteCount = 0;
    final total = src.width * src.height;

    for (int y = 0; y < src.height; y++) {
      for (int x = 0; x < src.width; x++) {
        if (_luma(src, x, y) > 128) whiteCount++;
      }
    }

    return whiteCount < total ~/ 2 ? img.invert(src) : src;
  }

  // ------------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------------

  static int _luma(img.Image image, int x, int y) {
    final pixel = image.getPixel(x, y);
    final r = pixel.r.toInt();
    final g = pixel.g.toInt();
    final b = pixel.b.toInt();
    return ((0.299 * r) + (0.587 * g) + (0.114 * b)).round();
  }

  static double _variance(List<double> values) {
    if (values.isEmpty) return 0;
    final mean = values.reduce((a, b) => a + b) / values.length;
    final squaredDiffs = values.map((v) => pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b) / values.length;
  }

  static List<int> _encodeByExtension(img.Image image, String path) {
    final ext = path.split('.').last.toLowerCase();
    if (ext == 'png') return img.encodePng(image);
    return img.encodeJpg(image, quality: 92);
  }
}

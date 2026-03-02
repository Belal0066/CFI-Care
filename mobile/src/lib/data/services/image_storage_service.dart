import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:gal/gal.dart';

class ImageStorageService {
  Future<String> save({
    required String title,
    required String tempPath,
  }) async {
    final appDir = await getApplicationDocumentsDirectory();
    
    // Sanitize title
    final safeTitle = title.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    final internalFile = File('${appDir.path}/$safeTitle.jpg');

    // 1. Create Internal Copy
    await File(tempPath).copy(internalFile.path);

    // 2. Save to Gallery
    try {
      await Gal.putImage(internalFile.path, album: 'CFI Care');
    } catch (e) {
      print("Gallery Error: $e");
    }

    // 3. CRITICAL FIX: Ensure internal file still exists
    if (!await internalFile.exists()) {
       await File(tempPath).copy(internalFile.path);
    }

    return internalFile.path;
  }
}
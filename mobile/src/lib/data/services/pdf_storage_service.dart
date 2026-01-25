import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:media_store_plus/media_store_plus.dart';
import 'package:fluttertoast/fluttertoast.dart';

class PdfStorageService {
  String _buildSafePdfFileName(String title) {
    if (title.isEmpty) return "Untitled_Document";
    return title
        .trim()
        .replaceAll(RegExp(r'[\\/:*?"<>|]'), '_')
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  Future<String> save({
    required String title,
    required String tempPath,
  }) async {
    final appDir = await getApplicationDocumentsDirectory();
    final safeTitle = _buildSafePdfFileName(title);
    
    // 1. Create the persistent file in Internal Storage
    final internalFile = File('${appDir.path}/$safeTitle.pdf');
    await File(tempPath).copy(internalFile.path);

    // 2. Save to Downloads (Public Gallery)
    final mediaStore = MediaStore();
    try {
      await mediaStore.saveFile(
        tempFilePath: internalFile.path,
        dirName: DirName.download,
        dirType: DirType.download,
        relativePath: 'CFICareDocs',
      );
      Fluttertoast.showToast(msg: "Saved to Downloads/CFICareDocs");
    } catch (e) {
      print("MediaStore Error: $e");
    }

    // 3. CRITICAL FIX: Ensure the internal file still exists
    // Some versions of MediaStore MOVE the file instead of copying it.
    if (!await internalFile.exists()) {
      print("File was moved by MediaStore. Restoring copy...");
      await File(tempPath).copy(internalFile.path);
    }

    return internalFile.path;
  }
}
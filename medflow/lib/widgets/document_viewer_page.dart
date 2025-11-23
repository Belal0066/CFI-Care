import 'dart:io';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';
import 'package:syncfusion_flutter_pdfviewer/pdfviewer.dart';
import '../models/document.dart';

class DocumentViewer extends StatelessWidget {
  final Document document;
  const DocumentViewer({required this.document, super.key});

  @override
  Widget build(BuildContext context) {
    final file = File(document.filePath);

    if (!file.existsSync()) {
      return Scaffold(
        appBar: AppBar(title: Text(document.title)),
        body: Center(child: Text("File not found")),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(document.title)),
      body: document.isPDF
          ? SfPdfViewer.file(file)  // Use File object, path must be valid
          : PhotoView(
              imageProvider: FileImage(file),
            ),
    );
  }
}

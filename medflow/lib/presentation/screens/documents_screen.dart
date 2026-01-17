import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:fluttertoast/fluttertoast.dart';

import '../../domain/models/document.dart';
import '../widgets/bottom_sheet_add_document.dart';
import '../viewmodels/add_document_viewmodel.dart'; // Form Logic
import '../viewmodels/document_provider.dart'; // Data Logic

class MedicalDocsPage extends StatefulWidget {
  const MedicalDocsPage({super.key});

  @override
  State<MedicalDocsPage> createState() => _MedicalDocsPageState();
}

class _MedicalDocsPageState extends State<MedicalDocsPage> {
  // REMOVED: List<DocumentModel> documents = [];  <-- Old way
  // REMOVED: bool isLoading = true;               <-- Old way

  @override
  void initState() {
    super.initState();
    // 1. Fetch Data via Provider when screen loads
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DocumentProvider>().fetchDocuments();
    });
  }

  void _openAddDocumentSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) {
        // Create Form VM locally for the sheet
        return ChangeNotifierProvider(
          create: (_) =>
              DocumentAddViewModel(), // Rename if you kept "DocumentAddViewModel"
          child: Consumer<DocumentAddViewModel>(
            builder: (context, viewModel, _) {
              return DocumentAddSheet(viewModel: viewModel);
            },
          ),
        );
      },
    );
  }

  void _openFile(String path) async {
    final file = File(path);
    if (await file.exists()) {
      final result = await OpenFilex.open(path);
      if (result.type != ResultType.done && mounted) {
        Fluttertoast.showToast(msg: "Could not open file: ${result.message}");
      }
    } else if (mounted) {
      Fluttertoast.showToast(msg: "File does not exist at path: $path");
    }
  }

  // TODO: Move this logic to DocumentProvider later for cleaner code
  void _deleteDocument(DocumentModel doc) async {
    // For now, we can just show a message.
    // To implement real delete, add deleteDocument() to your Provider.
    Fluttertoast.showToast(msg: "Delete feature coming soon");
  }

  @override
  Widget build(BuildContext context) {
    // 2. WATCH the Provider (This rebuilds the widget when data changes)
    final provider = context.watch<DocumentProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text("My Documents")),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddDocumentSheet,
        child: const Icon(Icons.add),
      ),
      // 3. Use PROVIDER state instead of local variables
      body: provider.isLoading
          ? const Center(child: CircularProgressIndicator())
          : provider.documents.isEmpty
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.folder_open, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text("No documents added yet."),
                ],
              ),
            )
          : ListView.builder(
              itemCount: provider.documents.length,
              itemBuilder: (ctx, index) {
                final doc = provider.documents[index];

                return Dismissible(
                  key: ValueKey(doc.id ?? doc.filePath),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    margin: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.delete, color: Colors.white),
                  ),
                  onDismissed: (direction) {
                    _deleteDocument(doc);
                  },
                  child: Card(
                    margin: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: ListTile(
                      onTap: () => _openFile(doc.filePath),
                      leading: Icon(
                        doc.isPDF ? Icons.picture_as_pdf : Icons.image,
                        color: Colors.blue,
                        size: 32,
                      ),
                      title: Text(
                        doc.title,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (doc.summary.isNotEmpty)
                            Text(
                              "Summary: ${doc.summary}",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          Text(
                            "${doc.type.name.toUpperCase()} • ${doc.speciality.name.toUpperCase()} • ${doc.time.format(context)}",
                            style: const TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                      isThreeLine: true,
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Sync Status Icon (Visual feedback for Offline-First)
                          if (doc.isSynced)
                            const Icon(
                              Icons.cloud_done,
                              color: Colors.green,
                              size: 16,
                            )
                          else
                            const Icon(
                              Icons.cloud_off,
                              color: Colors.grey,
                              size: 16,
                            ),
                          const SizedBox(width: 8),
                          const Icon(Icons.open_in_new, color: Colors.grey),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:open_filex/open_filex.dart'; // Needed to open files
import '../models/document.dart';
import '../widgets/bottom_sheet_add_document.dart';
import '../database/db_helper.dart';


class MedicalDocsPage extends StatefulWidget {
  const MedicalDocsPage({super.key});

  @override
  State<MedicalDocsPage> createState() => _MedicalDocsPageState();
}

class _MedicalDocsPageState extends State<MedicalDocsPage> {
  List<Document> documents = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  Future<void> _loadDocuments() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('currentUserId');

    if (userId != null) {
      final docs = await DBHelper.getDocumentsForUser(userId);
      setState(() {
        documents = docs;
        isLoading = false;
      });
    } else {
      setState(() => isLoading = false);
    }
  }

  void _openAddDocumentSheet() async {
    final Document? newDoc = await showModalBottomSheet<Document>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => const DocumentAddSheet(),
    );

    if (newDoc != null) {
      // Save to Database
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getString('currentUserId');
      
      if (userId != null) {
        await DBHelper.insertDocument(userId, newDoc);
        _loadDocuments(); // Reload list
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Please log in to save documents")),
          );
        }
      }
    }
  }

  void _openFile(String path) async {
    final file = File(path);
    if (await file.exists()) {
      final result = await OpenFilex.open(path);
      if (result.type != ResultType.done) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Could not open file: ${result.message}")),
          );
        }
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("File not found on device")),
        );
      }
    }
  }

  Future<void> _deleteDocument(Document doc, int index) async {
    // Optimistically remove from list
    setState(() {
      documents.removeAt(index);
    });

    // Remove from DB
    if (doc.id != null) {
      await DBHelper.deleteDocument(doc.id!);
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text("Document deleted"),
          action: SnackBarAction(
            label: "Undo",
            onPressed: () async {
              final prefs = await SharedPreferences.getInstance();
              final userId = prefs.getString('currentUserId');
              if (userId != null) {
                await DBHelper.insertDocument(userId, doc);
                _loadDocuments();
              }
            },
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("My Documents")),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddDocumentSheet,
        child: const Icon(Icons.add),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : documents.isEmpty
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
                  itemCount: documents.length,
                  itemBuilder: (ctx, index) {
                    final doc = documents[index];
                    
                    // --- Swipe to Delete ---
                    return Dismissible(
                      key: ValueKey(doc.id ?? doc.filePath), // Unique key
                      direction: DismissDirection.endToStart,
                      background: Container(
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 20),
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.delete, color: Colors.white),
                      ),
                      onDismissed: (direction) {
                        _deleteDocument(doc, index);
                      },
                      child: Card(
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: ListTile(
                          onTap: () => _openFile(doc.filePath),
                          leading: Icon(
                            doc.isPDF ? Icons.picture_as_pdf : Icons.image,
                            color: Colors.blue,
                            size: 32,
                          ),
                          title: Text(doc.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (doc.summary.isNotEmpty)
                                Text("Summary: ${doc.summary}", maxLines: 1, overflow: TextOverflow.ellipsis),
                              Text(
                                "${doc.type.name.toUpperCase()} • ${doc.speciality.name.toUpperCase()} • ${doc.time.format(context)}",
                                style: const TextStyle(fontSize: 12),
                              ),
                            ],
                          ),
                          isThreeLine: true,
                          trailing: const Icon(Icons.open_in_new, color: Colors.grey),
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
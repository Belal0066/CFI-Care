import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:fluttertoast/fluttertoast.dart';

import '../../domain/models/document.dart';
import '../widgets/bottom_sheet_add_document.dart';
import '../widgets/custom_search_header.dart'; // <--- Import your new Widget
import '../viewmodels/add_document_viewmodel.dart'; 
import '../viewmodels/document_provider.dart'; 

class MedicalDocsPage extends StatefulWidget {
  const MedicalDocsPage({super.key});

  @override
  State<MedicalDocsPage> createState() => _MedicalDocsPageState();
}

class _MedicalDocsPageState extends State<MedicalDocsPage> {
  // Local state for search filtering
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DocumentProvider>().fetchDocuments();
    });
  }

  void _runFilter(String value) {
    setState(() {
      _searchQuery = value.toLowerCase();
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
        return ChangeNotifierProvider(
          create: (_) => DocumentAddViewModel(),
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

  void _deleteDocument(DocumentModel doc) async {
    Fluttertoast.showToast(msg: "Delete feature coming soon");
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DocumentProvider>();
    
    // Filter Logic
    final displayDocs = _searchQuery.isEmpty
        ? provider.documents
        : provider.documents
            .where((doc) => doc.title.toLowerCase().contains(_searchQuery))
            .toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA), // Light grey background
      // REMOVED standard AppBar
      body: Column(
        children: [
          // --- 1. NEW CUSTOM HEADER ---
          CustomSearchHeader(
            title: "My Documents",
            hintText: "Search files...",
            showBackButton: true, // Set to false if this is a main tab
            onSearchChanged: (value) => _runFilter(value),
          ),
          
          // --- 2. DOCUMENT LIST ---
          Expanded(
            child: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : displayDocs.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.folder_open, size: 80, color: Colors.grey.shade300),
                            const SizedBox(height: 16),
                            Text(
                              _searchQuery.isEmpty 
                                  ? "No documents added yet." 
                                  : "No results found.",
                              style: TextStyle(fontSize: 18, color: Colors.grey.shade500),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 80), // Extra bottom padding for FAB
                        itemCount: displayDocs.length,
                        separatorBuilder: (ctx, index) => const SizedBox(height: 12),
                        itemBuilder: (ctx, index) {
                          final doc = displayDocs[index];

                          return Dismissible(
                            key: ValueKey(doc.id ?? doc.filePath),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.only(right: 20),
                              decoration: BoxDecoration(
                                color: const Color(0xFFD32F2F),
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: const Icon(Icons.delete, color: Colors.white),
                            ),
                            onDismissed: (direction) {
                              _deleteDocument(doc);
                            },
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.grey.withValues(alpha: 0.1),
                                    blurRadius: 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                onTap: () => _openFile(doc.filePath),
                                leading: Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: doc.isPDF 
                                        ? Colors.red.withValues(alpha: 0.1) 
                                        : Colors.blue.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    doc.isPDF ? Icons.picture_as_pdf : Icons.image,
                                    color: doc.isPDF ? Colors.red : Colors.blue,
                                    size: 28,
                                  ),
                                ),
                                title: Text(
                                  doc.title,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                ),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (doc.summary.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4.0),
                                        child: Text(
                                          doc.summary,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(color: Colors.grey.shade600),
                                        ),
                                      ),
                                    const SizedBox(height: 6),
                                    Row(
                                      children: [
                                        _buildTag(doc.type.name),
                                        const SizedBox(width: 6),
                                        _buildTag(doc.speciality.name),
                                        const Spacer(),
                                        Text(
                                          doc.time.format(context),
                                          style: TextStyle(fontSize: 12, color: Colors.grey.shade400),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    if (doc.isSynced)
                                      const Icon(Icons.cloud_done, color: Colors.green, size: 16)
                                    else
                                      const Icon(Icons.cloud_off, color: Colors.grey, size: 16),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddDocumentSheet,
        backgroundColor: const Color(0xFF0073CF),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  // Helper for small tags in the list item
  Widget _buildTag(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(fontSize: 10, color: Colors.grey.shade700, fontWeight: FontWeight.bold),
      ),
    );
  }
}
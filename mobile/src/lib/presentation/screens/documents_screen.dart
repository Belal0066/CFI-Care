import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:fluttertoast/fluttertoast.dart';

import '../../domain/models/document.dart';
import '../widgets/bottom_sheet_add_document.dart';
import '../widgets/custom_search_header.dart';
import '../viewmodels/add_document_viewmodel.dart';
import '../viewmodels/document_provider.dart';
import 'document_detail_screen.dart';

class MedicalDocsPage extends StatefulWidget {
  const MedicalDocsPage({super.key});

  @override
  State<MedicalDocsPage> createState() => _MedicalDocsPageState();
}

class _MedicalDocsPageState extends State<MedicalDocsPage> {
  // Set to true to preview all card states without a server connection.
  static const bool _mockMode = false;

  String _searchQuery = '';
  int _lastKnownFailureCount = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<DocumentProvider>();
      if (_mockMode) {
        provider.loadMockDocuments();
      } else {
        provider.fetchDocuments();
      }
    });
  }

  void _checkForNewFailures(DocumentProvider provider) {
    final count = provider.docsNeedingRetry.length;
    if (count > _lastKnownFailureCount) {
      _lastKnownFailureCount = count;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFFD32F2F),
            content: Text(
              '${count == 1 ? '1 document' : '$count documents'} failed after 2 retries. Tap Retry to try again.',
            ),
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'VIEW',
              textColor: Colors.white,
              onPressed: () {},
            ),
          ),
        );
      });
    } else if (count < _lastKnownFailureCount) {
      _lastKnownFailureCount = count;
    }
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

    _checkForNewFailures(provider);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      body: Column(
        children: [
          CustomSearchHeader(
            title: "My Documents",
            hintText: "Search files...",
            showBackButton: true,
            onSearchChanged: (value) => _runFilter(value),
          ),
          Expanded(
            child: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : displayDocs.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.folder_open,
                          size: 80,
                          color: Colors.grey.shade300,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _searchQuery.isEmpty
                              ? "No documents added yet."
                              : "No results found.",
                          style: TextStyle(
                            fontSize: 18,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(
                      16,
                      16,
                      16,
                      80,
                    ), // Extra bottom padding for FAB
                    itemCount: displayDocs.length,
                    separatorBuilder: (ctx, index) =>
                        const SizedBox(height: 12),
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
                          child: Column(
                            children: [
                              ListTile(
                                contentPadding: const EdgeInsets.fromLTRB(
                                  16,
                                  8,
                                  16,
                                  0,
                                ),
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        DocumentDetailScreen(doc: doc),
                                  ),
                                ),
                                leading: Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: doc.isPDF
                                        ? Colors.red.withValues(alpha: 0.1)
                                        : Colors.blue.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    doc.isPDF
                                        ? Icons.picture_as_pdf
                                        : Icons.image,
                                    color: doc.isPDF ? Colors.red : Colors.blue,
                                    size: 28,
                                  ),
                                ),
                                title: Text(
                                  doc.title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16,
                                  ),
                                ),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (doc.summary.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(
                                          top: 4.0,
                                        ),
                                        child: Text(
                                          doc.summary,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: Colors.grey.shade600,
                                            fontSize: 12,
                                          ),
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
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.grey.shade400,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                trailing: _buildSyncIcon(doc),
                              ),
                              _buildJobStatusRow(doc, provider),
                            ],
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
        style: TextStyle(
          fontSize: 10,
          color: Colors.grey.shade700,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildSyncIcon(DocumentModel doc) {
    switch (doc.syncStatus) {
      case 'synced':
        return const Icon(Icons.cloud_done, color: Colors.green, size: 20);
      case 'job_submitted':
        return const Icon(Icons.cloud_sync, color: Colors.blue, size: 20);
      case 'user_retry_needed':
        return const Icon(Icons.cloud_off, color: Color(0xFFD32F2F), size: 20);
      case 'failed':
        return const Icon(Icons.cloud_off, color: Colors.orange, size: 20);
      default:
        return const Icon(
          Icons.cloud_upload_outlined,
          color: Colors.grey,
          size: 20,
        );
    }
  }

  /// Shows progress bar + state label when a job is running,
  /// or an error banner with a Retry button when it needs user action.
  Widget _buildJobStatusRow(DocumentModel doc, DocumentProvider provider) {
    if (doc.syncStatus == 'user_retry_needed') {
      return Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEBEE),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFEF9A9A)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline, size: 16, color: Color(0xFFD32F2F)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                doc.lastError ?? 'Text extraction failed after 2 retries.',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: Color(0xFFD32F2F)),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () {
                if (doc.id != null) provider.retryDocument(doc.id!);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFD32F2F),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'RETRY',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (doc.syncStatus == 'job_submitted') {
      final label = _jobStateLabel(doc.jobState);
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 11, color: Colors.blue.shade700),
                ),
                const Spacer(),
                Text(
                  '${(doc.progress.clamp(0.0, 1.0) * 100).toStringAsFixed(0)}%',
                  style: TextStyle(fontSize: 11, color: Colors.blue.shade700),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: doc.progress > 0 ? doc.progress.clamp(0.0, 1.0) : null,
                minHeight: 4,
                backgroundColor: Colors.blue.shade50,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.blue.shade400),
              ),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }

  String _jobStateLabel(String? jobState) {
    switch (jobState) {
      case 'OCR_PROCESSING':
        return 'Reading text from document…';
      case 'MAPPING':
        return 'Converting to health records…';
      case 'COMPLETED':
        return 'Processing complete';
      case 'FAILED':
        return 'Processing failed';
      default:
        return 'Queued for processing…';
    }
  }
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:provider/provider.dart';

import '../../domain/models/document.dart';
import '../viewmodels/document_provider.dart';

class DocumentDetailScreen extends StatelessWidget {
  final DocumentModel doc;

  const DocumentDetailScreen({super.key, required this.doc});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DocumentProvider>();
    // Keep the card in sync if the provider updates the document
    final live = provider.documents.firstWhere(
      (d) => d.id == doc.id,
      orElse: () => doc,
    );

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      body: CustomScrollView(
        slivers: [
          _buildAppBar(context, live),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 16),
                  _buildStatusCard(live),
                  const SizedBox(height: 16),
                  _buildInfoCard(context, live),
                  if (live.summary.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _buildSummaryCard(live),
                  ],
                  if (live.details.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _buildDetailsCard(live),
                  ],
                  if (live.syncStatus == 'user_retry_needed') ...[
                    const SizedBox(height: 16),
                    _buildErrorCard(context, live, provider),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _buildOpenFileButton(context, live),
    );
  }

  // ── App Bar ──────────────────────────────────────────────────────────────

  SliverAppBar _buildAppBar(BuildContext context, DocumentModel live) {
    return SliverAppBar(
      expandedHeight: 160,
      pinned: true,
      backgroundColor: const Color(0xFF0073CF),
      foregroundColor: Colors.white,
      flexibleSpace: FlexibleSpaceBar(
        titlePadding: const EdgeInsets.fromLTRB(56, 0, 16, 16),
        title: Text(
          live.title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF0073CF), Color(0xFF005BA3)],
            ),
          ),
          child: Center(
            child: Icon(
              live.isPDF ? Icons.picture_as_pdf : Icons.image,
              size: 64,
              color: Colors.white.withValues(alpha: 0.3),
            ),
          ),
        ),
      ),
    );
  }

  // ── Status Card ──────────────────────────────────────────────────────────

  Widget _buildStatusCard(DocumentModel live) {
    final cfg = _statusConfig(live);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(cfg.icon, color: cfg.color, size: 20),
              const SizedBox(width: 8),
              Text(
                cfg.label,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: cfg.color,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: cfg.color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  cfg.badge,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: cfg.color,
                  ),
                ),
              ),
            ],
          ),
          if (live.syncStatus == 'job_submitted') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _jobStateLabel(live.jobState),
                    style: TextStyle(fontSize: 12, color: Colors.blue.shade700),
                  ),
                ),
                Text(
                  '${(live.progress * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue.shade700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: live.progress > 0 ? live.progress : null,
                minHeight: 6,
                backgroundColor: Colors.blue.shade50,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.blue.shade400),
              ),
            ),
            const SizedBox(height: 8),
            _buildPipelineSteps(live),
          ],
          if (live.retryCount > 0 && live.syncStatus != 'synced') ...[
            const SizedBox(height: 8),
            Text(
              'Auto-retry attempts: ${live.retryCount} / 2',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPipelineSteps(DocumentModel live) {
    final stages = [
      ('PENDING', 'Queued'),
      ('OCR_PROCESSING', 'Reading text'),
      ('MAPPING', 'Building records'),
      ('COMPLETED', 'Done'),
    ];

    final currentIndex = stages.indexWhere((s) => s.$1 == live.jobState);

    return Row(
      children: List.generate(stages.length * 2 - 1, (i) {
        if (i.isOdd) {
          // Connector line
          final leftDone = i ~/ 2 < currentIndex;
          return Expanded(
            child: Container(
              height: 2,
              color: leftDone ? Colors.blue.shade400 : Colors.grey.shade200,
            ),
          );
        }
        final stageIndex = i ~/ 2;
        final stage = stages[stageIndex];
        final isDone = stageIndex < currentIndex;
        final isCurrent = stageIndex == currentIndex;

        return Column(
          children: [
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isDone
                    ? Colors.blue.shade400
                    : isCurrent
                        ? Colors.white
                        : Colors.grey.shade200,
                border: isCurrent
                    ? Border.all(color: Colors.blue.shade400, width: 2)
                    : null,
              ),
              child: isDone
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : isCurrent
                      ? Center(
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.blue.shade400,
                            ),
                          ),
                        )
                      : null,
            ),
            const SizedBox(height: 4),
            Text(
              stage.$2,
              style: TextStyle(
                fontSize: 9,
                color: isDone || isCurrent
                    ? Colors.blue.shade700
                    : Colors.grey.shade400,
                fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        );
      }),
    );
  }

  // ── Info Card ─────────────────────────────────────────────────────────────

  Widget _buildInfoCard(BuildContext context, DocumentModel live) {
    return _card(
      title: 'Document Info',
      icon: Icons.info_outline,
      child: Column(
        children: [
          _infoRow(Icons.category_outlined, 'Type', live.type.name.toUpperCase()),
          const Divider(height: 1),
          _infoRow(Icons.local_hospital_outlined, 'Specialty', live.speciality.name.toUpperCase()),
          const Divider(height: 1),
          _infoRow(Icons.access_time, 'Time', live.time.format(context)),
          const Divider(height: 1),
          _infoRow(
            live.isPDF ? Icons.picture_as_pdf : Icons.image,
            'Format',
            live.isPDF ? 'PDF Document' : 'Image',
          ),
          if (live.jobId != null) ...[
            const Divider(height: 1),
            _infoRow(Icons.fingerprint, 'Job ID', live.jobId!, monospace: true),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value, {bool monospace = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade500),
          const SizedBox(width: 12),
          Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFamily: monospace ? 'monospace' : null,
              color: const Color(0xFF1A1A2E),
            ),
          ),
        ],
      ),
    );
  }

  // ── Summary Card ──────────────────────────────────────────────────────────

  Widget _buildSummaryCard(DocumentModel live) {
    return _card(
      title: 'Extracted Text',
      icon: Icons.text_snippet_outlined,
      child: Text(
        live.summary,
        style: TextStyle(
          fontSize: 13,
          color: Colors.grey.shade800,
          height: 1.6,
        ),
      ),
    );
  }

  // ── Details Card ──────────────────────────────────────────────────────────

  Widget _buildDetailsCard(DocumentModel live) {
    return _card(
      title: 'Notes',
      icon: Icons.notes,
      child: Text(
        live.details,
        style: TextStyle(fontSize: 13, color: Colors.grey.shade800, height: 1.6),
      ),
    );
  }

  // ── Error Card ────────────────────────────────────────────────────────────

  Widget _buildErrorCard(BuildContext context, DocumentModel live, DocumentProvider provider) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEBEE),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEF9A9A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.error_outline, color: Color(0xFFD32F2F), size: 20),
              const SizedBox(width: 8),
              const Text(
                'Text Extraction Failed',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: Color(0xFFD32F2F),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            live.lastError ?? 'The pipeline failed after 2 automatic retries.',
            style: TextStyle(fontSize: 13, color: Colors.red.shade800, height: 1.5),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: live.id == null
                  ? null
                  : () async {
                      await provider.retryDocument(live.id!);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Document re-queued for processing.'),
                            backgroundColor: Color(0xFF0073CF),
                          ),
                        );
                      }
                    },
              icon: const Icon(Icons.refresh),
              label: const Text('Retry Text Extraction'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFD32F2F),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Open File Button ──────────────────────────────────────────────────────

  Widget _buildOpenFileButton(BuildContext context, DocumentModel live) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton.icon(
            onPressed: () => _openFile(context, live),
            icon: Icon(live.isPDF ? Icons.picture_as_pdf : Icons.image),
            label: Text(live.isPDF ? 'Open PDF' : 'Open Image'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0073CF),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ),
    );
  }

  // ── Shared card wrapper ───────────────────────────────────────────────────

  Widget _card({
    required String title,
    required IconData icon,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: const Color(0xFF0073CF)),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: Color(0xFF1A1A2E),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  Future<void> _openFile(BuildContext context, DocumentModel live) async {
    final file = File(live.filePath);
    if (!await file.exists()) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              live.syncStatus == 'synced' && live.filePath.startsWith('/mock')
                  ? 'Mock mode: no real file at ${live.filePath}'
                  : 'File not found at ${live.filePath}',
            ),
          ),
        );
      }
      return;
    }
    final result = await OpenFilex.open(live.filePath);
    if (result.type != ResultType.done && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open file: ${result.message}')),
      );
    }
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

  ({IconData icon, Color color, String label, String badge}) _statusConfig(DocumentModel live) {
    switch (live.syncStatus) {
      case 'synced':
        return (
          icon: Icons.cloud_done,
          color: Colors.green,
          label: 'Text extraction complete',
          badge: 'SYNCED',
        );
      case 'job_submitted':
        return (
          icon: Icons.cloud_sync,
          color: Colors.blue,
          label: 'Processing your document',
          badge: live.jobState ?? 'PROCESSING',
        );
      case 'user_retry_needed':
        return (
          icon: Icons.error_outline,
          color: const Color(0xFFD32F2F),
          label: 'Extraction failed',
          badge: 'FAILED',
        );
      case 'failed':
        return (
          icon: Icons.warning_amber_outlined,
          color: Colors.orange,
          label: 'Upload failed — retrying',
          badge: 'RETRYING',
        );
      default:
        return (
          icon: Icons.schedule,
          color: Colors.grey,
          label: 'Waiting to upload',
          badge: 'PENDING',
        );
    }
  }
}

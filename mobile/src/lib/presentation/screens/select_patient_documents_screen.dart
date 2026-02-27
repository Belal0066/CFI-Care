import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/models/document.dart';
import '../viewmodels/document_provider.dart';

class SelectPatientDocumentsScreen extends StatefulWidget {
  final List<DocumentModel> initiallySelected;

  const SelectPatientDocumentsScreen({
    super.key,
    this.initiallySelected = const [],
  });

  @override
  State<SelectPatientDocumentsScreen> createState() =>
      _SelectPatientDocumentsScreenState();
}

class _SelectPatientDocumentsScreenState
    extends State<SelectPatientDocumentsScreen> {
  final Set<String> _selectedKeys = <String>{};

  @override
  void initState() {
    super.initState();
    for (final doc in widget.initiallySelected) {
      _selectedKeys.add(_docKey(doc));
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DocumentProvider>().fetchDocuments();
    });
  }

  String _docKey(DocumentModel doc) {
    return doc.serverId?.isNotEmpty == true
        ? 'server:${doc.serverId}'
        : 'local:${doc.id ?? doc.filePath}';
  }

  void _toggleDoc(DocumentModel doc, bool selected) {
    final key = _docKey(doc);
    setState(() {
      if (selected) {
        _selectedKeys.add(key);
      } else {
        _selectedKeys.remove(key);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DocumentProvider>();
    final docs = provider.documents;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Select Documents'),
        backgroundColor: const Color(0xFF0073CF),
        foregroundColor: Colors.white,
      ),
      body: provider.isLoading
          ? const Center(child: CircularProgressIndicator())
          : docs.isEmpty
          ? const Center(child: Text('No documents found for this patient.'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: docs.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final doc = docs[index];
                final key = _docKey(doc);
                final selected = _selectedKeys.contains(key);
                final canAttachToAppointment =
                    doc.serverId != null && doc.serverId!.isNotEmpty;

                return CheckboxListTile(
                  value: selected,
                  onChanged: canAttachToAppointment
                      ? (value) => _toggleDoc(doc, value ?? false)
                      : null,
                  title: Text(doc.title),
                  subtitle: Text(
                    canAttachToAppointment
                        ? 'Synced'
                        : 'Not synced yet (cannot attach)',
                  ),
                  secondary: Icon(
                    doc.isPDF ? Icons.picture_as_pdf : Icons.image,
                    color: doc.isPDF ? Colors.red : Colors.blue,
                  ),
                  controlAffinity: ListTileControlAffinity.trailing,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                );
              },
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: ElevatedButton(
            onPressed: () {
              final selectedDocs = docs
                  .where((doc) => _selectedKeys.contains(_docKey(doc)))
                  .toList();
              Navigator.of(context).pop(selectedDocs);
            },
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(double.infinity, 48),
              backgroundColor: const Color(0xFF0073CF),
              foregroundColor: Colors.white,
            ),
            child: const Text('Use Selected Documents'),
          ),
        ),
      ),
    );
  }
}

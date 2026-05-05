import '../../domain/models/document.dart';
import '../../utils/enums/type_of_event.dart';
import '../../utils/enums/speciality_event.dart';

class FhirDocumentPayloads {
  final String binaryId;
  final String documentReferenceId;
  final Map<String, dynamic> binary;
  final Map<String, dynamic> documentReference;

  const FhirDocumentPayloads({
    required this.binaryId,
    required this.documentReferenceId,
    required this.binary,
    required this.documentReference,
  });
}

class DocumentFhirMapper {
  static Future<FhirDocumentPayloads> toFhirR5Payloads({
    required DocumentModel document,
    required String patientId,
    String? binaryId,
    String? documentReferenceId,
    DateTime? recordedAt,
    String? authorReference,
  }) async {
    final resolvedBinaryId =
        binaryId ?? 'bin-${DateTime.now().millisecondsSinceEpoch}';
    final resolvedDocumentReferenceId =
        documentReferenceId ??
        'docref-${DateTime.now().millisecondsSinceEpoch}';
    final contentType = _detectContentType(document.filePath, document.isPDF);
    final effectiveDate = (recordedAt ?? DateTime.now())
        .toUtc()
        .toIso8601String();

    final binaryResource = <String, dynamic>{
      'resourceType': 'Binary',
      'id': resolvedBinaryId,
      'contentType': contentType,
    };

    final docRef = <String, dynamic>{
      'resourceType': 'DocumentReference',
      'id': resolvedDocumentReferenceId,
      'status': 'current',
      'subject': {'reference': 'Patient/$patientId'},
      'date': effectiveDate,
      'description': _buildDescription(document),
      'type': _mapType(document.type),
      'category': [_mapSpecialty(document.speciality)],
      'content': [
        {
          'attachment': {
            'contentType': contentType,
            'title': document.title,
            'url': 'Binary/$resolvedBinaryId',
          },
        },
      ],
    };

    if (authorReference != null && authorReference.isNotEmpty) {
      docRef['author'] = [
        {'reference': authorReference},
      ];
    }

    return FhirDocumentPayloads(
      binaryId: resolvedBinaryId,
      documentReferenceId: resolvedDocumentReferenceId,
      binary: binaryResource,
      documentReference: docRef,
    );
  }

  static String _buildDescription(DocumentModel document) {
    if (document.summary.trim().isNotEmpty) {
      return document.summary.trim();
    }
    if (document.details.trim().isNotEmpty) {
      return document.details.trim();
    }
    return document.title;
  }

  static String _detectContentType(String path, bool isPdf) {
    if (isPdf) return 'application/pdf';

    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';

    return 'application/octet-stream';
  }

  static Map<String, dynamic> _mapType(TypeOfEventEnum value) {
    switch (value) {
      case TypeOfEventEnum.lab:
        return {
          'coding': [
            {
              'system': 'http://loinc.org',
              'code': '11502-2',
              'display': 'Laboratory report',
            },
          ],
          'text': value.name,
        };
      case TypeOfEventEnum.scan:
        return {
          'coding': [
            {
              'system': 'http://loinc.org',
              'code': '18748-4',
              'display': 'Diagnostic imaging study',
            },
          ],
          'text': value.name,
        };
      case TypeOfEventEnum.appointment:
        return {
          'coding': [
            {
              'system': 'http://loinc.org',
              'code': '11488-4',
              'display': 'Consult note',
            },
          ],
          'text': value.name,
        };
      case TypeOfEventEnum.surgery:
        return {
          'coding': [
            {
              'system': 'http://loinc.org',
              'code': '11504-8',
              'display': 'Surgical operation note',
            },
          ],
          'text': value.name,
        };
      case TypeOfEventEnum.other:
        return {
          'coding': [
            {
              'system': 'http://loinc.org',
              'code': '34108-1',
              'display': 'Outpatient Note',
            },
          ],
          'text': value.name,
        };
    }
  }

  static Map<String, dynamic> _mapSpecialty(SpecialityEventEnum value) {
    final coding = _specialtyCoding(value);
    return {
      'coding': [coding],
      'text': value.name,
    };
  }

  static Map<String, String> _specialtyCoding(SpecialityEventEnum value) {
    switch (value) {
      case SpecialityEventEnum.cardiology:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394579002',
          'display': 'Cardiology',
        };
      case SpecialityEventEnum.neurology:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394591006',
          'display': 'Neurology',
        };
      case SpecialityEventEnum.hematology:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394598008',
          'display': 'Clinical haematology',
        };
      case SpecialityEventEnum.dermatology:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394582007',
          'display': 'Dermatology',
        };
      case SpecialityEventEnum.dentistry:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394583002',
          'display': 'Dentistry',
        };
      case SpecialityEventEnum.pediatrics:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394537008',
          'display': 'Paediatrics',
        };
      case SpecialityEventEnum.orthopedics:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394801005',
          'display': 'Orthopaedic surgery',
        };
      case SpecialityEventEnum.psychiatry:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394587001',
          'display': 'Psychiatry',
        };
      case SpecialityEventEnum.urology:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394612005',
          'display': 'Urology',
        };
      case SpecialityEventEnum.oncology:
        return {
          'system': 'http://snomed.info/sct',
          'code': '394592004',
          'display': 'Oncology',
        };
      case SpecialityEventEnum.other:
        return {
          'system': 'http://example.org/fhir/CodeSystem/cfi-specialty',
          'code': 'other',
          'display': 'Other',
        };
    }
  }
}

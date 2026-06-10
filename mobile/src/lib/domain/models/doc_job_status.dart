class DocJobStatus {
  final String state;      // PENDING | OCR_PROCESSING | MAPPING | COMPLETED | FAILED
  final double progress;   // 0.0 – 1.0
  final String? errorMessage;

  const DocJobStatus({
    required this.state,
    required this.progress,
    this.errorMessage,
  });

  bool get isCompleted => state == 'COMPLETED';
  bool get isFailed => state == 'FAILED';
  bool get isInProgress =>
      state == 'PENDING' || state == 'OCR_PROCESSING' || state == 'MAPPING';
}

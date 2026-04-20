"""Adapters for external service integration."""

from .ocr import OCRAdapter, OCRError, OCRErrorType
from .mapper import MapperAdapter, MapperError, MapperValidationError
from .downstream import DownstreamAdapter, DownstreamError
from .hapi_fhir import HapiFhirDownstreamAdapter, HapiFhirDownstreamError, HapiFhirDeliveryResult

__all__ = [
    "OCRAdapter",
    "OCRError",
    "OCRErrorType",
    "MapperAdapter",
    "MapperError",
    "MapperValidationError",
    "DownstreamAdapter",
    "DownstreamError",
    "HapiFhirDownstreamAdapter",
    "HapiFhirDownstreamError",
    "HapiFhirDeliveryResult",
]

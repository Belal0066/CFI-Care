"""Adapters for external service integration."""

from .ocr import OCRAdapter, OCRError, OCRErrorType
from .mapper import MapperAdapter, MapperError, MapperValidationError
from .downstream import DownstreamAdapter, DownstreamError

__all__ = [
    "OCRAdapter",
    "OCRError",
    "OCRErrorType",
    "MapperAdapter",
    "MapperError",
    "MapperValidationError",
    "DownstreamAdapter",
    "DownstreamError",
]

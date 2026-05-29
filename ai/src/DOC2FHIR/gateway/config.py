from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_RUNTIME_DIR = ROOT_DIR / ".gateway_runtime"


def _parse_csv(value: str | None, fallback: tuple[str, ...]) -> tuple[str, ...]:
    if not value:
        return fallback
    items = [item.strip().lower() for item in value.split(",") if item.strip()]
    return tuple(items) if items else fallback


@dataclass(frozen=True)
class GatewaySettings:
    app_name: str = "DOC2FHIR Gateway"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8001
    docs_url: str = "/docs"
    redoc_url: str = "/redoc"
    openapi_url: str = "/openapi.json"
    runtime_dir: Path = DEFAULT_RUNTIME_DIR
    db_path: Path = DEFAULT_RUNTIME_DIR / "gateway.db"
    upload_dir: Path = DEFAULT_RUNTIME_DIR / "uploads"
    max_upload_mb: int = 25
    allowed_extensions: tuple[str, ...] = (".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp")
    ocr_base_url: str = "http://127.0.0.1:7862"
    mapper_base_url: str = "http://127.0.0.1:8080"
    downstream_docfhir_url: str = "http://127.0.0.1:3000/v1/docfhir/"
    downstream_type: str = "nodejs"
    hapi_fhir_base_url: str = "http://127.0.0.1:8090/fhir"
    fhir_version: str = "5.0"
    structured_pipeline_enabled: bool = False
    structured_output_mode: str = "auto"
    structured_model_name: str = "default"
    classifier_model_name: str = "default"
    fhir_validator_jar: str | None = None
    fhir_validator_enabled: bool = False
    terminology_base_url: str | None = None
    terminology_api_key: str | None = None
    ocr_engine_name: str = "PaddleOCR"
    request_timeout_sec: int = 600
    max_background_tasks: int = 1
    queue_max_size: int = 32
    gpu_max_concurrency: int = 1
    gpu_lock_timeout_sec: int = 5
    ocr_stage_timeout_sec: int = 300
    mapper_stage_timeout_sec: int = 600
    downstream_stage_timeout_sec: int = 60
    default_correlation_prefix: str = "job"
    nodejs_callback_url: str = "http://127.0.0.1:3000/v1/internal/jobs/callback"
    internal_secret: str = "high_performance_cluster_secure_token_abc123"
    callback_retry_max: int = 3
    callback_retry_backoff: float = 1.0

    @classmethod
    def from_env(cls) -> "GatewaySettings":
        runtime_dir = Path(os.getenv("DOC2FHIR_GATEWAY_RUNTIME_DIR", str(DEFAULT_RUNTIME_DIR)))
        return cls(
            app_name=os.getenv("DOC2FHIR_GATEWAY_APP_NAME", cls.app_name),
            version=os.getenv("DOC2FHIR_GATEWAY_VERSION", cls.version),
            host=os.getenv("DOC2FHIR_GATEWAY_HOST", cls.host),
            port=int(os.getenv("DOC2FHIR_GATEWAY_PORT", str(cls.port))),
            docs_url=os.getenv("DOC2FHIR_GATEWAY_DOCS_URL", cls.docs_url),
            redoc_url=os.getenv("DOC2FHIR_GATEWAY_REDOC_URL", cls.redoc_url),
            openapi_url=os.getenv("DOC2FHIR_GATEWAY_OPENAPI_URL", cls.openapi_url),
            runtime_dir=runtime_dir,
            db_path=Path(os.getenv("DOC2FHIR_GATEWAY_DB_PATH", str(runtime_dir / "gateway.db"))),
            upload_dir=Path(os.getenv("DOC2FHIR_GATEWAY_UPLOAD_DIR", str(runtime_dir / "uploads"))),
            max_upload_mb=int(os.getenv("DOC2FHIR_GATEWAY_MAX_UPLOAD_MB", str(cls.max_upload_mb))),
            allowed_extensions=_parse_csv(
                os.getenv("DOC2FHIR_GATEWAY_ALLOWED_EXTENSIONS"),
                cls.allowed_extensions,
            ),
            ocr_base_url=os.getenv("DOC2FHIR_OCR_BASE_URL", cls.ocr_base_url),
            mapper_base_url=os.getenv("DOC2FHIR_MAPPER_BASE_URL", cls.mapper_base_url),
            downstream_docfhir_url=os.getenv("DOC2FHIR_DOWNSTREAM_DOCFHIR_URL", cls.downstream_docfhir_url),
            downstream_type=os.getenv("DOC2FHIR_DOWNSTREAM_TYPE", cls.downstream_type),
            hapi_fhir_base_url=os.getenv("DOC2FHIR_HAPI_FHIR_BASE_URL", cls.hapi_fhir_base_url),
            fhir_version=os.getenv("DOC2FHIR_FHIR_VERSION", cls.fhir_version),
            structured_pipeline_enabled=os.getenv("DOC2FHIR_STRUCTURED_PIPELINE_ENABLED", "false").lower() == "true",
            structured_output_mode=os.getenv("DOC2FHIR_STRUCTURED_OUTPUT_MODE", cls.structured_output_mode),
            structured_model_name=os.getenv("DOC2FHIR_STRUCTURED_MODEL_NAME", cls.structured_model_name),
            classifier_model_name=os.getenv("DOC2FHIR_CLASSIFIER_MODEL_NAME", cls.classifier_model_name),
            fhir_validator_jar=os.getenv("DOC2FHIR_FHIR_VALIDATOR_JAR", cls.fhir_validator_jar or "") or None,
            fhir_validator_enabled=os.getenv("DOC2FHIR_FHIR_VALIDATOR_ENABLED", "false").lower() == "true",
            terminology_base_url=os.getenv("DOC2FHIR_TERMINOLOGY_BASE_URL", cls.terminology_base_url or "") or None,
            terminology_api_key=os.getenv("DOC2FHIR_TERMINOLOGY_API_KEY", cls.terminology_api_key or "") or None,
            ocr_engine_name=os.getenv("DOC2FHIR_OCR_ENGINE_NAME", cls.ocr_engine_name),
            request_timeout_sec=int(os.getenv("DOC2FHIR_GATEWAY_REQUEST_TIMEOUT_SEC", str(cls.request_timeout_sec))),
            max_background_tasks=int(os.getenv("DOC2FHIR_GATEWAY_MAX_BACKGROUND_TASKS", str(cls.max_background_tasks))),
            queue_max_size=int(os.getenv("DOC2FHIR_GATEWAY_QUEUE_MAX_SIZE", str(cls.queue_max_size))),
            gpu_max_concurrency=int(os.getenv("DOC2FHIR_GATEWAY_GPU_MAX_CONCURRENCY", str(cls.gpu_max_concurrency))),
            gpu_lock_timeout_sec=int(os.getenv("DOC2FHIR_GATEWAY_GPU_LOCK_TIMEOUT_SEC", str(cls.gpu_lock_timeout_sec))),
            ocr_stage_timeout_sec=int(os.getenv("DOC2FHIR_GATEWAY_OCR_STAGE_TIMEOUT_SEC", str(cls.ocr_stage_timeout_sec))),
            mapper_stage_timeout_sec=int(os.getenv("DOC2FHIR_GATEWAY_MAPPER_STAGE_TIMEOUT_SEC", str(cls.mapper_stage_timeout_sec))),
            downstream_stage_timeout_sec=int(
                os.getenv("DOC2FHIR_GATEWAY_DOWNSTREAM_STAGE_TIMEOUT_SEC", str(cls.downstream_stage_timeout_sec))
            ),
            default_correlation_prefix=os.getenv("DOC2FHIR_GATEWAY_CORRELATION_PREFIX", cls.default_correlation_prefix),
            nodejs_callback_url=os.getenv("DOC2FHIR_NODEJS_CALLBACK_URL", cls.nodejs_callback_url),
            internal_secret=os.getenv("DOC2FHIR_INTERNAL_SECRET", cls.internal_secret),
            callback_retry_max=int(os.getenv("DOC2FHIR_CALLBACK_RETRY_MAX", str(cls.callback_retry_max))),
            callback_retry_backoff=float(
                os.getenv("DOC2FHIR_CALLBACK_RETRY_BACKOFF", str(cls.callback_retry_backoff))
            ),
        )

    def ensure_directories(self) -> None:
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def as_public_dict(self) -> dict[str, str | int | list[str]]:
        return {
            "app_name": self.app_name,
            "version": self.version,
            "host": self.host,
            "port": self.port,
            "runtime_dir": str(self.runtime_dir),
            "db_path": str(self.db_path),
            "upload_dir": str(self.upload_dir),
            "allowed_extensions": list(self.allowed_extensions),
            "ocr_base_url": self.ocr_base_url,
            "mapper_base_url": self.mapper_base_url,
            "downstream_docfhir_url": self.downstream_docfhir_url,
            "downstream_type": self.downstream_type,
            "hapi_fhir_base_url": self.hapi_fhir_base_url,
            "fhir_version": self.fhir_version,
            "structured_pipeline_enabled": self.structured_pipeline_enabled,
            "structured_output_mode": self.structured_output_mode,
            "structured_model_name": self.structured_model_name,
            "classifier_model_name": self.classifier_model_name,
            "request_timeout_sec": self.request_timeout_sec,
            "max_background_tasks": self.max_background_tasks,
            "queue_max_size": self.queue_max_size,
            "gpu_max_concurrency": self.gpu_max_concurrency,
            "gpu_lock_timeout_sec": self.gpu_lock_timeout_sec,
            "ocr_stage_timeout_sec": self.ocr_stage_timeout_sec,
            "mapper_stage_timeout_sec": self.mapper_stage_timeout_sec,
            "downstream_stage_timeout_sec": self.downstream_stage_timeout_sec,
        }
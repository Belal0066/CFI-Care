"""
Ticket 1.4: Ingestion Service.
Chunks, embeds, and writes FHIR resources to the Qdrant vector store.
"""
import logging
import json
from datetime import datetime
from typing import Union, List, Optional, Dict, Any
from fhir.resources.resource import Resource
from fhir.resources.patient import Patient
from fhir.resources.encounter import Encounter
from fhir.resources.observation import Observation
from fhir.resources.condition import Condition
from qdrant_client.models import PointIdsList

from src.shared.db_clients import qdrant_client
from src.ingestion.toon import ToonNormalizer, toon_encode

logger = logging.getLogger(__name__)

class IngestionError(Exception):
    pass

class IngestionService:
    """
    Handles the ingestion of FHIR resources into Qdrant.
    """

    _embedding_model = None
    _sparse_model = None
    
    @classmethod
    def _get_embedding_model(cls):
        """Lazy load the FastEmbed model for CPU efficiency."""
        if cls._embedding_model is None:
            from fastembed import TextEmbedding
            logger.info("Loading FastEmbed model on CPU (optimized for multi-threading)")
            # Standard model: BAAI/bge-small-en-v1.5 (384-dim)
            # For 768-dim parity with PubMedBERT, use: BAAI/bge-base-en-v1.5
            cls._embedding_model = TextEmbedding(model_name="BAAI/bge-base-en-v1.5")
        return cls._embedding_model
    
    @classmethod
    def _get_sparse_model(cls):
        """Lazy load the Sparse FastEmbed model."""
        if cls._sparse_model is None:
            try:
                from fastembed import SparseTextEmbedding
                logger.info("Loading SPLADE Sparse model")
                # Use a widely supported model (prithivida/Splade_PP_en_v1)
                cls._sparse_model = SparseTextEmbedding(model_name="prithivida/Splade_PP_en_v1")
            except ImportError:
                logger.warning("SparseTextEmbedding not available in fastembed version. Skipping sparse vectors.")
                return None
            except Exception as e:
                logger.error(f"Failed to load sparse model: {e}")
                return None
        return cls._sparse_model
    
    @classmethod
    def get_embedding(cls, text: str) -> List[float]:
        """
        Generate embedding using FastEmbed (CPU).
        """
        model = cls._get_embedding_model()
        # FastEmbed returns a generator of embeddings
        embeddings = list(model.embed([text]))
        return embeddings[0].tolist()
    
    @classmethod
    def get_sparse_embedding(cls, text: str) -> Optional[Dict[str, Any]]:
        """
        Generate sparse embedding (SPLADE).
        Returns {'indices': [...], 'values': [...]} or None
        """
        model = cls._get_sparse_model()
        if not model:
            return None
        
        # FastEmbed sparse returns generator of SparseEmbedding (indices, values)
        # We need to explicitly list it
        embeddings = list(model.embed([text]))
        if not embeddings:
            return None
            
        sparse_vector = embeddings[0]
        # Depending on version, sparse_vector might have .indices and .values or be a named tuple
        # Safe access
        indices = getattr(sparse_vector, "indices", None)
        values = getattr(sparse_vector, "values", None)
        
        if indices is None or values is None:
             # Fallback if structure varies
             return None
             
        return {"indices": indices.tolist(), "values": values.tolist()}

    @classmethod
    def ingest_resource(cls, resource: Union[Resource, Dict[str, Any]]) -> bool:
        """
        Ingest a FHIR resource (or Bundle) into Qdrant.
        Supports: Standard FHIR, FHIR Bundles, and Custom Node Lists.
        """
        is_dict = isinstance(resource, dict)
        
        # 0. Handle Custom Node List Format (priority check)
        if is_dict and "nodes" in resource and isinstance(resource.get("nodes"), list):
            logger.info(f"Processing Custom Node List (found {len(resource['nodes'])} nodes)...")
            nodes = resource["nodes"]
            patient_id_global = resource.get("eocId", "pat-001")  # Extract from eocId or default
            
            success_count = 0
            for idx, node in enumerate(nodes):
                node_id = node.get("id")
                if not node_id:
                    logger.warning(f"Skipping node {idx}: Missing ID")
                    continue
                
                # Convert custom node to full-fidelity TOON format
                toon_str = toon_encode(node)
                
                # Determine resource type
                resource_type = "Encounter"
                if node.get("isDiagnosis"):
                    resource_type = "Condition"
                
                # Embed & Store (with chunking for long documents)
                try:
                    from src.retrieval.indexing import DocumentChunker
                    chunker = DocumentChunker()

                    # Derive boolean filter flags from node data for Qdrant payload filtering
                    cat = node.get("category", "")
                    is_diag = node.get("isDiagnosis", False) or cat == "Diagnosis"
                    is_med = cat == "Prescription"
                    is_allergy = cat in ("Allergy", "Adverse")
                    is_symptom = cat in ("Symptom", "Complaint")
                    is_outcome = cat == "FollowUp"

                    # Derive temporal and graph metadata
                    date_issued = node.get("dateIssued", "")
                    date_unix = 0
                    if date_issued:
                        try:
                            if 'T' in date_issued:
                                dt = datetime.fromisoformat(date_issued.replace('Z', '+00:00'))
                            else:
                                dt = datetime.strptime(date_issued, "%Y-%m-%d")
                            date_unix = int(dt.timestamp())
                        except (ValueError, TypeError):
                            pass

                    father_id = node.get("father")
                    event_tag = node.get("category", "Encounter")
                    eoc_id = resource.get("eocId", patient_id_global)
                    is_investigation = cat in ("Imaging", "Lab", "Consultation")

                    chunks = chunker.chunk_text(toon_str, node_id, chunk_size=400, overlap=50)
                    for chunk in chunks:
                        vector = cls.get_embedding(chunk.text)
                        sparse_data = cls.get_sparse_embedding(chunk.text)
                        sparse_indices = sparse_data["indices"] if sparse_data else None
                        sparse_values = sparse_data["values"] if sparse_data else None

                        payload = {
                            "id": chunk.chunk_id,
                            "patient_id": patient_id_global,
                            "resource_type": resource_type,
                            "toon_content": chunk.text,
                            "fhir_raw": json.dumps(node),
                            "chunk_index": chunk.chunk_index,
                            "parent_node_id": node_id,
                            "is_diagnosis": is_diag,
                            "is_medication": is_med,
                            "is_allergy": is_allergy,
                            "is_symptom": is_symptom,
                            "is_outcome": is_outcome,
                            # New fields for encounter-level retrieval
                            "father_id": father_id,
                            "date_issued": date_issued,
                            "date_unix": date_unix,
                            "event_tag": event_tag,
                            "eoc_id": eoc_id,
                            "is_investigation": is_investigation,
                        }
                        
                        qdrant_client.upsert_point(
                            point_id=chunk.chunk_id,
                            vector=vector,
                            sparse_indices=sparse_indices,
                            sparse_values=sparse_values,
                            payload=payload
                        )
                    logger.info(f"Ingested custom node {node_id} ({len(chunks)} chunk(s))")
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to ingest node {node_id}: {e}")
            
            logger.info(f"Custom Node List: {success_count}/{len(nodes)} successful")
            return success_count > 0
        
        # 1. Handle Bundles Recursively
        rt = resource.get("resourceType") if is_dict else resource.get_resource_type()
        
        if rt == "Bundle":
            logger.info("Processing FHIR Bundle...")
            entries = resource.get("entry", []) if is_dict else (resource.entry or [])
            success_count = 0
            for entry in entries:
                res = entry.get("resource") if is_dict else entry.resource
                if res:
                    if cls.ingest_resource(res):
                        success_count += 1
            return success_count > 0

        # 2. Identify & Prepare Single Resource
        try:
            if is_dict:
                rid = resource.get("id")
            else:
                rid = resource.id

            if not rid:
                raise ValueError("Resource must have an ID")

            # Extract Patient ID for Vector filtering
            patient_id = None
            
            if rt == "Patient":
                patient_id = rid
            else:
                if is_dict:
                    subject = resource.get("subject", {})
                    ref = subject.get("reference")
                    if not ref:
                        # Try 'patient' (alternate field in some profiles)
                        ref = resource.get("patient", {}).get("reference")
                    
                    if ref and "Patient/" in ref:
                        patient_id = ref.split("Patient/")[1].split("/")[0]
                else:
                    if hasattr(resource, "subject") and resource.subject and resource.subject.reference:
                        ref = resource.subject.reference
                        if "Patient/" in ref:
                            patient_id = ref.split("Patient/")[1].split("/")[0]

            # Normalize to full-fidelity TOON format
            toon_str = toon_encode(resource)

        except Exception as e:
            rt_label = resource.get("resourceType") if isinstance(resource, dict) else resource.get_resource_type()
            rid_label = resource.get("id") if isinstance(resource, dict) else resource.id
            logger.error(f"Preparation failed for {rt_label}/{rid_label}: {e}")
            raise IngestionError(f"Prep Phase Failed: {e}")

        # 2. Vector Write (Primary Storage) with chunking for long documents
        try:
            from src.retrieval.indexing import DocumentChunker
            chunker = DocumentChunker()
            chunks = chunker.chunk_text(toon_str, rid, chunk_size=400, overlap=50)

            fhir_raw_str = json.dumps(resource) if is_dict else resource.model_dump_json()

            # Derive boolean filter flags from FHIR resource type
            is_diag = rt == "Condition"
            is_med = rt == "MedicationRequest"
            is_allergy = rt == "AllergyIntolerance"
            is_symptom = False
            is_outcome = False

            # Derive temporal metadata for FHIR resources
            date_issued = ""
            date_unix = 0
            father_id = None
            event_tag = rt
            is_investigation = rt in ("ImagingStudy", "DiagnosticReport", "Observation")

            if is_dict:
                date_issued = resource.get("period", {}).get("start", "")
                if not date_issued:
                    date_issued = resource.get("date", "")
            else:
                if hasattr(resource, "period") and resource.period and resource.period.start:
                    date_issued = resource.period.start.isoformat()
                elif hasattr(resource, "date") and resource.date:
                    date_issued = resource.date.isoformat()

            if date_issued:
                try:
                    if 'T' in date_issued:
                        dt = datetime.fromisoformat(date_issued.replace('Z', '+00:00'))
                    else:
                        dt = datetime.strptime(date_issued, "%Y-%m-%d")
                    date_unix = int(dt.timestamp())
                except (ValueError, TypeError):
                    pass

            for chunk in chunks:
                vector = cls.get_embedding(chunk.text)
                sparse_data = cls.get_sparse_embedding(chunk.text)
                sparse_indices = sparse_data["indices"] if sparse_data else None
                sparse_values = sparse_data["values"] if sparse_data else None

                payload = {
                    "id": chunk.chunk_id,
                    "patient_id": patient_id,
                    "resource_type": rt,
                    "toon_content": chunk.text,
                    "fhir_raw": fhir_raw_str,
                    "chunk_index": chunk.chunk_index,
                    "parent_node_id": rid,
                    "is_diagnosis": is_diag,
                    "is_medication": is_med,
                    "is_allergy": is_allergy,
                    "is_symptom": is_symptom,
                    "is_outcome": is_outcome,
                    # New fields for encounter-level retrieval
                    "father_id": father_id,
                    "date_issued": date_issued,
                    "date_unix": date_unix,
                    "event_tag": event_tag,
                    "eoc_id": patient_id,
                    "is_investigation": is_investigation,
                }

                qdrant_client.upsert_point(
                    point_id=chunk.chunk_id,
                    vector=vector,
                    sparse_indices=sparse_indices,
                    sparse_values=sparse_values,
                    payload=payload
                )
            logger.info(f"Ingestion complete for {rt}/{rid} ({len(chunks)} chunk(s))")
            return True

        except Exception as e:
            logger.error(f"Vector write failed for {rid}: {e}")
            raise IngestionError("Vector Write Phase Failed")

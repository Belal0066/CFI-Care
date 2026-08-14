"""
Database Connection Handlers.
Implements reliability patterns and connection pooling for the Qdrant vector store.
"""
from typing import Optional, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, SparseVectorParams, SparseIndexParams
from .config import config
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QdrantVectorClient:
    """
    Qdrant (Vector) connection handler.
    Ensures collection initialization with proper dimensionality (Dense + Sparse).
    """
    
    def __init__(self):
        self.client: Optional[QdrantClient] = None
        self.collection_name = config.qdrant_collection_name
        self.dimension = config.embedding_dimension
        self.sparse_vector_name = "text-sparse"
    
    def connect(self) -> QdrantClient:
        """Establish connection to Qdrant."""
        if self.client is None:
            self.client = QdrantClient(
                host=config.qdrant_host,
                port=config.qdrant_port
            )
            logger.info(f"Connected to Qdrant at {config.qdrant_host}:{config.qdrant_port}")
            self._ensure_collection()
        return self.client
    
    def _ensure_collection(self):
        """Initialize collection if it doesn't exist."""
        client = self.connect()
        collections = client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if self.collection_name not in collection_names:
            client.create_collection(
                collection_name=self.collection_name,
                vectors_config={
                    "text-dense": VectorParams(
                        size=self.dimension,
                        distance=Distance.COSINE
                    )
                },
                sparse_vectors_config={
                    self.sparse_vector_name: SparseVectorParams(
                        index=SparseIndexParams(
                            on_disk=False,
                        )
                    )
                }
            )
            logger.info(f"Created Qdrant collection: {self.collection_name} (Hybrid=True)")
        else:
            logger.info(f"Qdrant collection already exists: {self.collection_name}")
    
    def upsert_point(self, point_id: str, vector: list[float], sparse_indices: list[int] = None, sparse_values: list[float] = None, payload: Dict[str, Any] = None):
        """
        Insert or update a vector point with Hybrid support.
        
        Args:
            point_id: UUID matching the Graph node
            vector: Dense embedding
            sparse_indices: SPLADE indices
            sparse_values: SPLADE values
            payload: Metadata including clinical context
        """
        client = self.connect()
        try:
            # Convert string ID to UUID if needed
            import uuid
            if isinstance(point_id, str):
                # Try to use as UUID, or generate deterministic UUID from string
                try:
                    uuid_id = uuid.UUID(point_id) if '-' in point_id and len(point_id) == 36 else uuid.uuid5(uuid.NAMESPACE_DNS, point_id)
                    point_id_final = str(uuid_id)
                except:
                    # Generate deterministic UUID from string
                    point_id_final = str(uuid.uuid5(uuid.NAMESPACE_DNS, point_id))
            else:
                point_id_final = str(point_id)
            
            # Note: We need to import models here or at top
            from qdrant_client import models

            # Construct Point
            vector_struct = {
                "text-dense": vector
            }
            if sparse_indices and sparse_values:
                 vector_struct[self.sparse_vector_name] = models.SparseVector(
                     indices=sparse_indices,
                     values=sparse_values
                 )
            
            # If no sparse is provided, we might still want to support legacy/dense-only
            # but ideally we upgrade everywhere. 
            # For this patch, we adapt based on input.

            vec_input = {}
            # Dense
            vec_input["text-dense"] = vector
            
            # Sparse
            if sparse_indices is not None and sparse_values is not None:
                vec_input[self.sparse_vector_name] = models.SparseVector(
                    indices=sparse_indices,
                    values=sparse_values
                )
            
            client.upsert(
                collection_name=self.collection_name,
                points=[PointStruct(
                    id=point_id_final,
                    vector=vec_input,
                    payload=payload
                )]
            )
            logger.info(f"Upserted point to Qdrant: {point_id_final}")
        except Exception as e:
            logger.error(f"Qdrant upsert failed for {point_id}: {e}")
            raise
    
    @staticmethod
    def point_uuid(point_id: Any) -> str:
        """Same id rule as upsert_point: UUIDs kept, other strings mapped via uuid5."""
        import uuid
        if isinstance(point_id, str):
            try:
                if "-" in point_id and len(point_id) == 36:
                    return str(uuid.UUID(point_id))
            except ValueError:
                pass
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, point_id))
        return str(point_id)

    def upsert_points(self, points: list[Dict[str, Any]]):
        """
        Batch upsert. Each item: point_id, vector, sparse_indices,
        sparse_values, payload (same fields as upsert_point).
        """
        from qdrant_client import models
        client = self.connect()
        structs = []
        for p in points:
            vec_input = {"text-dense": p["vector"]}
            if p.get("sparse_indices") is not None and p.get("sparse_values") is not None:
                vec_input[self.sparse_vector_name] = models.SparseVector(
                    indices=p["sparse_indices"], values=p["sparse_values"]
                )
            structs.append(PointStruct(
                id=self.point_uuid(p["point_id"]), vector=vec_input, payload=p.get("payload")
            ))
        client.upsert(collection_name=self.collection_name, points=structs, wait=True)

    def ensure_payload_indexes(self):
        """
        Keyword indexes on the fields every agent query filters or groups on.
        Without them a patient_id filter scans every point.
        """
        from qdrant_client.models import PayloadSchemaType
        client = self.connect()
        for field in ("patient_id", "parent_node_id", "resource_type"):
            client.create_payload_index(
                collection_name=self.collection_name,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
            )
        for field in ("is_diagnosis", "is_medication", "is_allergy", "is_symptom", "is_outcome"):
            client.create_payload_index(
                collection_name=self.collection_name,
                field_name=field,
                field_schema=PayloadSchemaType.BOOL,
            )

    def health_check(self) -> bool:
        """Verify Qdrant is accessible."""
        try:
            client = self.connect()
            client.get_collections()
            return True
        except Exception as e:
            logger.error(f"Qdrant health check failed: {e}")
            return False


# Singleton instance
qdrant_client = QdrantVectorClient()

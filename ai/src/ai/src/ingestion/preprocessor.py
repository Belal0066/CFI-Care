"""
Ticket 4.1-4.2: Preprocessing & Normalization Layer
Performs deterministic preprocessing and semantic normalization of clinical encounter nodes.

Key Responsibilities:
1. Parse and validate input JSON nodes
2. Normalize timestamps to ISO-8601 format
3. Sort nodes chronologically
4. Preserve graph relationships (father links)
5. Map categories to internal semantic enums
6. Tag nodes with clinical event types
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)


class ClinicalCategory(str, Enum):
    """Normalized clinical categories"""
    SYMPTOM = "Symptom"
    DIAGNOSIS = "Diagnosis"
    MEDICATION = "Medication"
    ALLERGY = "Allergy"
    ADVERSE_REACTION = "AdverseReaction"
    FOLLOW_UP = "FollowUp"
    IMAGING = "Imaging"
    LAB = "Lab"
    CONSULTATION = "Consultation"
    PRESCRIPTION = "Prescription"
    UNKNOWN = "Unknown"


class Normality(str, Enum):
    """Normalized status flags"""
    NORMAL = "Normal"
    ABNORMAL = "Abnormal"
    UNKNOWN = "Unknown"


class DiagnosisType(str, Enum):
    """Diagnosis classification"""
    PROVISIONAL = "Provisional"
    DIFFERENTIAL = "Differential"
    FINAL = "Final"
    NONE = "None"


class EventTag(str, Enum):
    """High-level semantic event tags for RAG retrieval"""
    SYMPTOM = "Symptom"
    DIAGNOSIS = "Diagnosis"
    MEDICATION = "Medication"
    ALLERGY_ADVERSE = "Allergy/Adverse"
    FOLLOW_UP_OUTCOME = "FollowUp/Outcome"
    INVESTIGATION = "Investigation"


class NormalizedNode(BaseModel):
    """
    Normalized clinical event representation.
    This is the canonical internal format after preprocessing.
    """
    # Original identifiers
    id: str
    eoc_id: str
    
    # Temporal
    date_issued: datetime
    date_normalized: str  # ISO-8601 string
    
    # Content
    text_primary: str  # text_1
    details: str
    
    # Graph structure
    father_id: Optional[str] = None
    relationship_type: Optional[str] = None
    
    # Semantic flags (normalized)
    category: ClinicalCategory
    normality: Normality
    priority: str
    
    # Clinical tagging
    is_diagnosis: bool
    diagnosis_type: DiagnosisType
    event_tag: EventTag
    
    # Metadata
    is_manual_branch: bool = False
    related_resource_ids: Dict[str, List[str]] = Field(default_factory=dict)
    
    # Audit trail
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        use_enum_values = True


class PreprocessingError(Exception):
    """Custom exception for preprocessing failures"""
    pass


class ClinicalPreprocessor:
    """
    Deterministic preprocessing pipeline for clinical encounter nodes.
    Implements the normalization layer described in system spec 4.1-4.2.
    """
    
    @staticmethod
    def normalize_timestamp(date_str: str) -> datetime:
        """
        Parse and normalize dateIssued to datetime object.
        Handles multiple input formats.
        """
        if not date_str:
            raise PreprocessingError("Missing dateIssued field")
        
        try:
            # ISO format with timezone
            if 'T' in date_str:
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            # Simple date format YYYY-MM-DD
            else:
                return datetime.strptime(date_str, "%Y-%m-%d")
        except (ValueError, AttributeError) as e:
            logger.error(f"Failed to parse date '{date_str}': {e}")
            raise PreprocessingError(f"Invalid date format: {date_str}")
    
    @staticmethod
    def map_category(raw_category: str) -> ClinicalCategory:
        """
        Map raw category strings to normalized ClinicalCategory enum.
        """
        category_mapping = {
            "Consultation": ClinicalCategory.CONSULTATION,
            "Prescription": ClinicalCategory.PRESCRIPTION,
            "Imaging": ClinicalCategory.IMAGING,
            "Lab": ClinicalCategory.LAB,
            "FollowUp": ClinicalCategory.FOLLOW_UP,
            "Allergy": ClinicalCategory.ALLERGY,
            # Add more mappings as needed
        }
        
        normalized = category_mapping.get(raw_category)
        if not normalized:
            logger.warning(f"Unknown category '{raw_category}', defaulting to UNKNOWN")
            return ClinicalCategory.UNKNOWN
        
        return normalized
    
    @staticmethod
    def map_normality(raw_normality: str) -> Normality:
        """Map raw normality strings to normalized enum."""
        normality_mapping = {
            "Normal": Normality.NORMAL,
            "Abnormal": Normality.ABNORMAL,
        }
        
        return normality_mapping.get(raw_normality, Normality.UNKNOWN)
    
    @staticmethod
    def determine_diagnosis_type(
        node: Dict[str, Any],
        normalized_category: ClinicalCategory
    ) -> DiagnosisType:
        """
        Classify diagnosis as Provisional, Differential, or Final.
        """
        if not node.get("isDiagnosis", False):
            return DiagnosisType.NONE
        
        text_lower = node.get("text_1", "").lower()
        details_lower = node.get("details", "").lower()
        
        # Check for differential diagnosis keywords
        if "differential" in text_lower or "differential" in details_lower:
            return DiagnosisType.DIFFERENTIAL
        
        # Check for final diagnosis keywords
        if any(kw in text_lower for kw in ["final", "confirmed"]):
            return DiagnosisType.FINAL
        
        # Check details for confirmation markers
        if any(kw in details_lower for kw in ["confirmed", "established", "definitive"]):
            return DiagnosisType.FINAL
        
        # Default to provisional if not clearly marked
        return DiagnosisType.PROVISIONAL
    
    @staticmethod
    def determine_event_tag(
        category: ClinicalCategory,
        is_diagnosis: bool,
        diagnosis_type: DiagnosisType,
        text: str,
        details: str
    ) -> EventTag:
        """
        Tag node with high-level semantic event type for RAG.
        This is the primary classification for retrieval.
        """
        # Diagnosis takes priority
        if is_diagnosis and diagnosis_type != DiagnosisType.NONE:
            return EventTag.DIAGNOSIS
        
        # Category-based mapping
        if category == ClinicalCategory.ALLERGY:
            return EventTag.ALLERGY_ADVERSE
        
        if category in [ClinicalCategory.PRESCRIPTION, ClinicalCategory.MEDICATION]:
            return EventTag.MEDICATION
        
        if category == ClinicalCategory.FOLLOW_UP:
            return EventTag.FOLLOW_UP_OUTCOME
        
        if category in [ClinicalCategory.IMAGING, ClinicalCategory.LAB]:
            return EventTag.INVESTIGATION
        
        # Content-based detection for symptoms
        text_lower = text.lower()
        details_lower = details.lower()
        
        symptom_keywords = [
            "symptom", "complaint", "hpi", "presents with",
            "cough", "fever", "pain", "fatigue", "rash"
        ]
        
        if any(kw in text_lower or kw in details_lower for kw in symptom_keywords):
            return EventTag.SYMPTOM
        
        # Check for adverse reactions
        if any(kw in text_lower or kw in details_lower 
               for kw in ["adverse", "reaction", "allergy", "intolerance"]):
            return EventTag.ALLERGY_ADVERSE
        
        # Check for outcome/improvement markers
        if any(kw in text_lower or kw in details_lower 
               for kw in ["improved", "resolved", "better", "recovered"]):
            return EventTag.FOLLOW_UP_OUTCOME
        
        # Default: if consultation and no clear marker, likely symptom presentation
        if category == ClinicalCategory.CONSULTATION:
            return EventTag.SYMPTOM
        
        return EventTag.INVESTIGATION  # Default fallback
    
    @classmethod
    def normalize_node(cls, raw_node: Dict[str, Any], eoc_id: str) -> NormalizedNode:
        """
        Transform a raw node into a NormalizedNode.
        Performs all semantic and structural normalization.
        """
        try:
            # Parse timestamp
            date_issued = cls.normalize_timestamp(raw_node.get("dateIssued", ""))
            
            # Map enums
            category = cls.map_category(raw_node.get("category", ""))
            normality = cls.map_normality(raw_node.get("normality", ""))
            
            # Determine diagnosis type
            is_diagnosis = raw_node.get("isDiagnosis", False)
            diagnosis_type = cls.determine_diagnosis_type(raw_node, category)
            
            # Determine event tag
            text_primary = raw_node.get("text_1", "")
            details = raw_node.get("details", "")
            event_tag = cls.determine_event_tag(
                category, is_diagnosis, diagnosis_type, text_primary, details
            )
            
            # Parse timestamps for audit
            created_at = None
            updated_at = None
            try:
                if raw_node.get("createdAt"):
                    created_at = datetime.fromisoformat(
                        raw_node["createdAt"].replace('Z', '+00:00')
                    )
                if raw_node.get("updatedAt"):
                    updated_at = datetime.fromisoformat(
                        raw_node["updatedAt"].replace('Z', '+00:00')
                    )
            except Exception as e:
                logger.warning(f"Failed to parse audit timestamps: {e}")
            
            return NormalizedNode(
                id=raw_node.get("id", ""),
                eoc_id=eoc_id,
                date_issued=date_issued,
                date_normalized=date_issued.isoformat(),
                text_primary=text_primary,
                details=details,
                father_id=raw_node.get("father"),
                relationship_type=raw_node.get("relationshipType"),
                category=category,
                normality=normality,
                priority=raw_node.get("priority", "Medium"),
                is_diagnosis=is_diagnosis,
                diagnosis_type=diagnosis_type,
                event_tag=event_tag,
                is_manual_branch=raw_node.get("isManualBranch", False),
                related_resource_ids=raw_node.get("relatedResourceIds", {}),
                created_at=created_at,
                updated_at=updated_at
            )
            
        except Exception as e:
            logger.error(f"Failed to normalize node {raw_node.get('id', 'unknown')}: {e}")
            raise PreprocessingError(f"Node normalization failed: {e}")
    
    @classmethod
    def sort_chronologically(cls, nodes: List[NormalizedNode]) -> List[NormalizedNode]:
        """
        Sort nodes by date_issued (oldest first).
        Preserves insertion order for same-day events.
        """
        return sorted(nodes, key=lambda n: n.date_issued)
    
    @classmethod
    def build_graph_structure(cls, nodes: List[NormalizedNode]) -> Dict[str, Any]:
        """
        Analyze and preserve graph relationships (father links).
        Returns metadata about the graph structure.
        """
        node_map = {n.id: n for n in nodes}
        
        # Find root nodes (no father)
        root_nodes = [n for n in nodes if not n.father_id]
        
        # Build adjacency structure
        children_map: Dict[str, List[str]] = {}
        for node in nodes:
            if node.father_id:
                if node.father_id not in children_map:
                    children_map[node.father_id] = []
                children_map[node.father_id].append(node.id)
        
        return {
            "node_map": node_map,
            "root_nodes": root_nodes,
            "children_map": children_map,
            "total_nodes": len(nodes),
            "root_count": len(root_nodes)
        }
    
    @classmethod
    def preprocess_timeline(cls, input_json: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point: Process raw JSON input into normalized timeline.
        
        Returns:
        {
            "normalized_nodes": List[NormalizedNode],
            "timeline": List[NormalizedNode],  # chronologically sorted
            "graph_structure": Dict,
            "eoc_id": str,
            "statistics": Dict
        }
        """
        try:
            # Extract data
            raw_nodes = input_json.get("nodes", [])
            eoc_id = input_json.get("eocId", "")
            
            if not raw_nodes:
                raise PreprocessingError("No nodes found in input")
            
            if not eoc_id:
                raise PreprocessingError("Missing eocId")
            
            logger.info(f"Preprocessing {len(raw_nodes)} nodes for EOC {eoc_id}")
            
            # Phase 1: Normalize each node
            normalized_nodes = []
            errors = []
            
            for idx, raw_node in enumerate(raw_nodes):
                try:
                    normalized = cls.normalize_node(raw_node, eoc_id)
                    normalized_nodes.append(normalized)
                except PreprocessingError as e:
                    errors.append({
                        "index": idx,
                        "node_id": raw_node.get("id", "unknown"),
                        "error": str(e)
                    })
                    logger.error(f"Skipping node {idx}: {e}")
            
            if not normalized_nodes:
                raise PreprocessingError("All nodes failed normalization")
            
            # Phase 2: Sort chronologically
            timeline = cls.sort_chronologically(normalized_nodes)
            
            # Phase 3: Build graph structure
            graph_structure = cls.build_graph_structure(normalized_nodes)
            
            # Collect statistics
            event_tag_counts = {}
            for node in normalized_nodes:
                tag = node.event_tag
                event_tag_counts[tag] = event_tag_counts.get(tag, 0) + 1
            
            statistics = {
                "total_input_nodes": len(raw_nodes),
                "successfully_normalized": len(normalized_nodes),
                "failed_nodes": len(errors),
                "errors": errors,
                "date_range": {
                    "earliest": timeline[0].date_normalized if timeline else None,
                    "latest": timeline[-1].date_normalized if timeline else None
                },
                "event_tag_distribution": event_tag_counts,
                "diagnosis_count": sum(1 for n in normalized_nodes if n.is_diagnosis),
                "root_nodes": len(graph_structure["root_nodes"])
            }
            
            logger.info(f"Preprocessing complete: {statistics['successfully_normalized']}/{statistics['total_input_nodes']} nodes processed")
            
            return {
                "normalized_nodes": normalized_nodes,
                "timeline": timeline,
                "graph_structure": graph_structure,
                "eoc_id": eoc_id,
                "statistics": statistics
            }
            
        except Exception as e:
            logger.error(f"Preprocessing pipeline failed: {e}")
            raise PreprocessingError(f"Pipeline failure: {e}")


def preprocess_json_file(file_path: str) -> Dict[str, Any]:
    """
    Convenience function: Load JSON from file and preprocess.
    """
    import json
    
    try:
        with open(file_path, 'r') as f:
            input_json = json.load(f)
        
        return ClinicalPreprocessor.preprocess_timeline(input_json)
        
    except FileNotFoundError:
        raise PreprocessingError(f"Input file not found: {file_path}")
    except json.JSONDecodeError as e:
        raise PreprocessingError(f"Invalid JSON: {e}")


if __name__ == "__main__":
    # Test with sample data
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Example usage
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    
    print("\n=== Preprocessing Results ===")
    print(f"EOC ID: {result['eoc_id']}")
    print(f"\nStatistics:")
    for key, value in result['statistics'].items():
        print(f"  {key}: {value}")
    
    print(f"\n=== Timeline (First 3 Events) ===")
    for node in result['timeline'][:3]:
        print(f"[{node.date_normalized}] {node.event_tag}: {node.text_primary}")

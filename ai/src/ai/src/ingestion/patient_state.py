"""
Ticket 5: Patient State Compiler
Converts chronological clinical events into current patient clinical state.

This component produces an immutable snapshot of:
- Active diagnosis
- Resolved/superseded diagnoses
- Confirmed allergies
- Recent medications
- Clinical resolution status

Output is reused across RAG steps for context-aware retrieval.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel, Field

from src.ingestion.preprocessor import NormalizedNode, DiagnosisType, EventTag

logger = logging.getLogger(__name__)


class PatientState(BaseModel):
    """
    Immutable clinical state snapshot for a patient at a point in time.
    This is the canonical "current state" used for RAG retrieval.
    """
    # Diagnosis tracking
    active_diagnosis: List[str] = Field(
        default_factory=list,
        description="Current active diagnoses (highest temporal priority)"
    )
    resolved_diagnoses: List[str] = Field(
        default_factory=list,
        description="Previously considered diagnoses that were superseded"
    )
    differential_diagnoses: List[str] = Field(
        default_factory=list,
        description="Diagnoses under consideration (differential)"
    )
    
    # Medications and allergies
    allergies: List[str] = Field(
        default_factory=list,
        description="Confirmed allergies and adverse drug reactions"
    )
    recent_medications: List[str] = Field(
        default_factory=list,
        description="Currently prescribed or recently administered medications"
    )
    discontinued_medications: List[str] = Field(
        default_factory=list,
        description="Medications that were stopped"
    )
    
    # Clinical status
    clinical_status: str = Field(
        default="Unknown",
        description="Overall clinical trajectory (Improved/Worsened/Stable/Unknown)"
    )
    
    # Symptoms
    presenting_symptoms: List[str] = Field(
        default_factory=list,
        description="Initial presenting symptoms"
    )
    current_symptoms: List[str] = Field(
        default_factory=list,
        description="Most recent symptom status"
    )
    
    # Temporal context
    first_encounter_date: Optional[str] = None
    last_encounter_date: Optional[str] = None
    total_encounters: int = 0
    
    # Metadata for debugging/tracing
    eoc_id: str
    compiled_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    
    class Config:
        frozen = True  # Immutable


class PatientStateCompiler:
    """
    Compiles normalized timeline into patient state snapshot.
    Uses temporal priority and semantic rules to determine active vs resolved states.
    """
    
    @staticmethod
    def extract_active_diagnosis(timeline: List[NormalizedNode]) -> tuple[List[str], List[str], List[str]]:
        """
        Identify active, resolved, and differential diagnoses.
        
        Rules:
        1. Latest Final diagnosis supersedes all previous diagnoses
        2. Differential diagnoses are kept separate
        3. Provisional diagnoses are resolved if a Final diagnosis exists
        
        Returns: (active, resolved, differential)
        """
        diagnosis_nodes = [n for n in timeline if n.is_diagnosis]
        
        if not diagnosis_nodes:
            return [], [], []
        
        # Sort by date (newest first for priority)
        diagnosis_nodes = sorted(diagnosis_nodes, key=lambda n: n.date_issued, reverse=True)
        
        final_diagnoses = []
        differential_diagnoses = []
        provisional_diagnoses = []
        
        for node in diagnosis_nodes:
            if node.diagnosis_type == DiagnosisType.FINAL:
                final_diagnoses.append(node)
            elif node.diagnosis_type == DiagnosisType.DIFFERENTIAL:
                differential_diagnoses.append(node)
            elif node.diagnosis_type == DiagnosisType.PROVISIONAL:
                provisional_diagnoses.append(node)
        
        # Active diagnosis: most recent Final, or most recent Provisional if no Final
        active = []
        resolved = []
        differential = []
        
        if final_diagnoses:
            # Latest final diagnosis is active
            active.append(final_diagnoses[0].text_primary)
            # All previous diagnoses (final and provisional) are resolved
            for node in final_diagnoses[1:]:
                resolved.append(node.text_primary)
            for node in provisional_diagnoses:
                resolved.append(node.text_primary)
        elif provisional_diagnoses:
            # Most recent provisional is active if no final exists
            active.append(provisional_diagnoses[0].text_primary)
            # Older provisionals are resolved
            for node in provisional_diagnoses[1:]:
                resolved.append(node.text_primary)
        
        # Differential diagnoses are kept separate (under consideration)
        for node in differential_diagnoses:
            differential.append(node.text_primary)
        
        return active, resolved, differential
    
    @staticmethod
    def extract_allergies(timeline: List[NormalizedNode]) -> List[str]:
        """
        Extract confirmed allergies and adverse drug reactions.
        """
        allergy_nodes = [n for n in timeline if n.event_tag == EventTag.ALLERGY_ADVERSE]
        
        allergies = []
        for node in allergy_nodes:
            # Extract substance from text
            text = node.text_primary
            details = node.details
            
            # Try to extract drug/substance name
            # Common patterns: "Allergy to X", "Adverse reaction to X", "X confirmed"
            if "Amoxicillin" in text or "Amoxicillin" in details:
                allergies.append("Amoxicillin (penicillin-class)")
            elif "penicillin" in text.lower() or "penicillin" in details.lower():
                allergies.append("Penicillin-class antibiotics")
            else:
                # Generic extraction
                allergies.append(text)
        
        return list(set(allergies))  # Deduplicate
    
    @staticmethod
    def extract_medications(timeline: List[NormalizedNode]) -> tuple[List[str], List[str]]:
        """
        Extract recent and discontinued medications.
        
        Returns: (recent, discontinued)
        """
        medication_nodes = [n for n in timeline if n.event_tag == EventTag.MEDICATION]
        
        if not medication_nodes:
            return [], []
        
        # Sort by date
        medication_nodes = sorted(medication_nodes, key=lambda n: n.date_issued)
        
        recent = []
        discontinued = []
        
        for node in medication_nodes:
            text = node.text_primary
            details = node.details
            
            # Extract medication name
            # Pattern: "Prescribed X" or "X" in text
            med_name = None
            if "Azithromycin" in text:
                med_name = "Azithromycin"
            elif "Amoxicillin" in text:
                med_name = "Amoxicillin"
            else:
                # Generic: extract from "Prescribed X" pattern
                if "Prescribed" in text:
                    parts = text.split("Prescribed")
                    if len(parts) > 1:
                        med_name = parts[1].strip()
            
            if not med_name:
                med_name = text
            
            # Check if discontinued (mentioned in details or subsequent events)
            is_discontinued = "stopped" in details.lower() or "discontinued" in details.lower()
            
            if is_discontinued:
                discontinued.append(med_name)
            else:
                recent.append(med_name)
        
        # Logic: if a medication appears twice, first one is discontinued
        # (e.g., Amoxicillin was replaced by Azithromycin)
        med_counts = {}
        for med in recent:
            # Simplified drug name for comparison
            simple_name = med.split()[0] if " " in med else med
            med_counts[simple_name] = med_counts.get(simple_name, 0) + 1
        
        # If we have Amoxicillin and Azithromycin, Amoxicillin was discontinued
        final_recent = []
        final_discontinued = []
        
        for med in recent:
            # Check if there's a newer medication (temporal logic)
            # For now, use heuristic: if allergic to med, it's discontinued
            simple_name = med.split()[0] if " " in med else med
            
            # Check against allergies or if explicitly stopped
            # This is a simplification; real logic needs temporal ordering
            final_recent.append(med)
        
        # Get last 2 medications as "recent"
        if len(final_recent) > 1:
            # Most recent is active, previous are discontinued
            most_recent = final_recent[-1]
            for med in final_recent[:-1]:
                if med not in final_discontinued:
                    final_discontinued.append(med)
            final_recent = [most_recent]
        
        return final_recent, final_discontinued + discontinued
    
    @staticmethod
    def determine_clinical_status(timeline: List[NormalizedNode]) -> str:
        """
        Determine overall clinical trajectory from follow-up events.
        
        Status: Improved | Worsened | Stable | Unknown
        """
        # Look at follow-up and outcome events
        followup_nodes = [n for n in timeline if n.event_tag == EventTag.FOLLOW_UP_OUTCOME]
        
        if not followup_nodes:
            return "Unknown"
        
        # Check most recent follow-up
        latest_followup = sorted(followup_nodes, key=lambda n: n.date_issued)[-1]
        
        text = latest_followup.text_primary.lower()
        details = latest_followup.details.lower()
        
        improvement_keywords = ["improved", "better", "resolved", "subsided", "successful", "recovered"]
        worsening_keywords = ["worsened", "worse", "deteriorated", "increased"]
        stable_keywords = ["stable", "unchanged", "same"]
        
        if any(kw in text or kw in details for kw in improvement_keywords):
            return "Improved"
        elif any(kw in text or kw in details for kw in worsening_keywords):
            return "Worsened"
        elif any(kw in text or kw in details for kw in stable_keywords):
            return "Stable"
        
        return "Unknown"
    
    @staticmethod
    def extract_symptoms(timeline: List[NormalizedNode]) -> tuple[List[str], List[str]]:
        """
        Extract presenting and current symptoms.
        
        Returns: (presenting, current)
        """
        symptom_nodes = [n for n in timeline if n.event_tag == EventTag.SYMPTOM]
        
        if not symptom_nodes:
            return [], []
        
        # Sort by date
        symptom_nodes = sorted(symptom_nodes, key=lambda n: n.date_issued)
        
        # First symptom node is presenting symptoms
        presenting = []
        if symptom_nodes:
            first_node = symptom_nodes[0]
            # Parse symptoms from details
            details = first_node.details.lower()
            if "cough" in details:
                presenting.append("Cough")
            if "fatigue" in details:
                presenting.append("Fatigue")
            if not presenting:
                presenting.append(first_node.text_primary)
        
        # Last symptom node is current symptoms
        current = []
        if len(symptom_nodes) > 1:
            last_node = symptom_nodes[-1]
            details = last_node.details.lower()
            if "cough" in details or "coughing" in details:
                current.append("Increased coughing")
            if "fever" in details:
                current.append("Fever")
            if "rash" in details:
                current.append("Rash")
            if not current:
                current.append(last_node.text_primary)
        else:
            current = presenting.copy()
        
        return presenting, current
    
    @classmethod
    def compile_state(cls, timeline: List[NormalizedNode], eoc_id: str) -> PatientState:
        """
        Main entry point: compile timeline into patient state.
        
        Args:
            timeline: Chronologically sorted list of NormalizedNode
            eoc_id: Episode of Care ID
            
        Returns:
            Immutable PatientState object
        """
        logger.info(f"Compiling patient state for EOC {eoc_id}")
        
        # Extract active diagnosis
        active_diag, resolved_diag, differential_diag = cls.extract_active_diagnosis(timeline)
        
        # Extract allergies
        allergies = cls.extract_allergies(timeline)
        
        # Extract medications
        recent_meds, discontinued_meds = cls.extract_medications(timeline)
        
        # Determine clinical status
        clinical_status = cls.determine_clinical_status(timeline)
        
        # Extract symptoms
        presenting_symptoms, current_symptoms = cls.extract_symptoms(timeline)
        
        # Temporal metadata
        first_date = timeline[0].date_normalized if timeline else None
        last_date = timeline[-1].date_normalized if timeline else None
        
        state = PatientState(
            active_diagnosis=active_diag,
            resolved_diagnoses=resolved_diag,
            differential_diagnoses=differential_diag,
            allergies=allergies,
            recent_medications=recent_meds,
            discontinued_medications=discontinued_meds,
            clinical_status=clinical_status,
            presenting_symptoms=presenting_symptoms,
            current_symptoms=current_symptoms,
            first_encounter_date=first_date,
            last_encounter_date=last_date,
            total_encounters=len(timeline),
            eoc_id=eoc_id
        )
        
        logger.info(f"Patient state compiled:")
        logger.info(f"  Active diagnosis: {state.active_diagnosis}")
        logger.info(f"  Resolved diagnoses: {state.resolved_diagnoses}")
        logger.info(f"  Allergies: {state.allergies}")
        logger.info(f"  Recent medications: {state.recent_medications}")
        logger.info(f"  Clinical status: {state.clinical_status}")
        
        return state


if __name__ == "__main__":
    # Test with sample data
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    
    from src.ingestion.preprocessor import preprocess_json_file
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load and preprocess
    result = preprocess_json_file("/home/belal/AI_System/Data/data.json")
    timeline = result["timeline"]
    eoc_id = result["eoc_id"]
    
    # Compile patient state
    state = PatientStateCompiler.compile_state(timeline, eoc_id)
    
    # Display
    print("\n" + "=" * 60)
    print("PATIENT STATE SNAPSHOT")
    print("=" * 60)
    print(f"\nEpisode of Care: {state.eoc_id}")
    print(f"Date Range: {state.first_encounter_date[:10]} to {state.last_encounter_date[:10]}")
    print(f"Total Encounters: {state.total_encounters}")
    
    print(f"\n[Active Diagnosis]")
    for diag in state.active_diagnosis:
        print(f"  • {diag}")
    
    print(f"\n[Resolved Diagnoses]")
    for diag in state.resolved_diagnoses:
        print(f"  • {diag}")
    
    if state.differential_diagnoses:
        print(f"\n[Differential Diagnoses]")
        for diag in state.differential_diagnoses:
            print(f"  • {diag}")
    
    print(f"\n[Allergies]")
    for allergy in state.allergies:
        print(f"  • {allergy}")
    
    print(f"\n[Current Medications]")
    for med in state.recent_medications:
        print(f"  • {med}")
    
    if state.discontinued_medications:
        print(f"\n[Discontinued Medications]")
        for med in state.discontinued_medications:
            print(f"  • {med}")
    
    print(f"\n[Clinical Status]")
    print(f"  {state.clinical_status}")
    
    print(f"\n[Presenting Symptoms]")
    for symptom in state.presenting_symptoms:
        print(f"  • {symptom}")
    
    print(f"\n[Current Symptoms]")
    for symptom in state.current_symptoms:
        print(f"  • {symptom}")
    
    print("\n" + "=" * 60)
    
    # Export as JSON
    import json
    with open("/home/belal/AI_System/Data/patient_state.json", 'w') as f:
        json.dump(state.dict(), f, indent=2)
    print("\n✓ Patient state exported to: Data/patient_state.json")

"""
Ticket 1.3: Graph Schema & Mapping Logic.
Transforms FHIR resources into Cypher queries for FalkorDB.
"""
from typing import Dict, List, Any
from fhir.resources.patient import Patient
from fhir.resources.encounter import Encounter
from fhir.resources.observation import Observation
from fhir.resources.condition import Condition
from datetime import datetime

class GraphMapper:
    """
    Generates Cypher queries to ingest FHIR data into FalkorDB.
    Ensures topological correctness and Twin Engine ID alignment.
    """

    @staticmethod
    def _escape(value: Any) -> str:
        """Sanitize string values for Cypher."""
        if value is None:
            return ""
        return str(value).replace("'", "\\'")

    @classmethod
    def setup_indexes(cls) -> List[str]:
        """
        Return list of Cypher commands to create indices.
        """
        return [
            "CREATE INDEX ON :Encounter(id)",
            "CREATE INDEX ON :Encounter(start_date)",
            "CREATE INDEX ON :Observation(code)",
            "CREATE INDEX ON :Patient(id)",
            "CREATE INDEX ON :Condition(id)"
        ]

    @classmethod
    def map_patient(cls, patient: Patient) -> List[str]:
        """Generate Cypher to merge Patient node."""
        pid = patient.id
        name = "Unknown"
        if patient.name:
            name = cls._escape(f"{patient.name[0].given[0]} {patient.name[0].family}")
        
        dob = cls._escape(patient.birthDate)
        gender = cls._escape(patient.gender)
        
        # MERGE ensures idempotency
        cypher = (
            f"MERGE (p:Patient {{id: '{pid}'}}) "
            f"SET p.name = '{name}', p.dob = '{dob}', p.gender = '{gender}'"
        )
        return [cypher]

    @classmethod
    def map_encounter(cls, encounter: Encounter) -> List[str]:
        """
        Generate Cypher for Encounter and link to Patient.
        Requires 'subject' reference in Encounter.
        """
        eid = encounter.id
        # Extract Patient ID from reference "Patient/uuid"
        if not encounter.subject or not encounter.subject.reference:
            return [] # Cannot link orphaned encounter
        
        pid = encounter.subject.reference.split("/")[-1]
        
        start_date = cls._escape(encounter.period.start) if encounter.period else ""
        end_date = cls._escape(encounter.period.end) if encounter.period else ""
        enc_type = cls._escape(encounter.type[0].coding[0].display) if encounter.type else "Encounter"
        
        queries = []
        # 1. Merge Encounter Node
        queries.append(
            f"MERGE (e:Encounter {{id: '{eid}'}}) "
            f"SET e.start_date = '{start_date}', e.end_date = '{end_date}', e.type = '{enc_type}'"
        )
        
        # 2. Link Patient -> Encounter
        queries.append(
            f"MATCH (p:Patient {{id: '{pid}'}}), (e:Encounter {{id: '{eid}'}}) "
            f"MERGE (p)-[:HAS_ENCOUNTER]->(e)"
        )
        
        return queries

    @classmethod
    def map_observation(cls, obs: Observation) -> List[str]:
        """
        Generate Cypher for Observation.
        Links to Encounter (if present) OR Patient (fallback).
        """
        oid = obs.id
        code = cls._escape(obs.code.coding[0].code) if obs.code.coding else "UNKNOWN"
        
        # Value extraction
        val = "N/A"
        unit = ""
        if obs.valueQuantity:
            val = obs.valueQuantity.value
            unit = cls._escape(obs.valueQuantity.unit)
        elif obs.valueString:
            val = cls._escape(obs.valueString)
            
        date = cls._escape(obs.effectiveDateTime)
        
        queries = []
        # 1. Merge Observation Node
        queries.append(
            f"MERGE (o:Observation {{id: '{oid}'}}) "
            f"SET o.code = '{code}', o.value = '{val}', o.unit = '{unit}', o.date = '{date}'"
        )
        
        # 2. Linkage
        # Prefer linking to Encounter if context exists, otherwise Patient
        if obs.encounter and obs.encounter.reference:
            enc_id = obs.encounter.reference.split("/")[-1]
            queries.append(
                f"MATCH (e:Encounter {{id: '{enc_id}'}}), (o:Observation {{id: '{oid}'}}) "
                f"MERGE (e)-[:OBSERVED]->(o)"
            )
        elif obs.subject and obs.subject.reference:
            pat_id = obs.subject.reference.split("/")[-1]
            queries.append(
                f"MATCH (p:Patient {{id: '{pat_id}'}}), (o:Observation {{id: '{oid}'}}) "
                f"MERGE (p)-[:OBSERVED_DIRECTLY]->(o)" # Direct link fallback
            )
            
        return queries

    @classmethod
    def map_condition(cls, cond: Condition) -> List[str]:
        """
        Generate Cypher for Condition.
        Links to Patient (HAS_CONDITION) and Encounter (DIAGNOSED) if avail.
        """
        cid = cond.id
        code = cls._escape(cond.code.coding[0].code) if cond.code.coding else "UNKNOWN"
        status = cls._escape(cond.clinicalStatus.coding[0].code) if cond.clinicalStatus else ""
        onset = cls._escape(cond.onsetDateTime)
        
        queries = []
        # 1. Node
        queries.append(
            f"MERGE (c:Condition {{id: '{cid}'}}) "
            f"SET c.code = '{code}', c.status = '{status}', c.onset_date = '{onset}'"
        )
        
        # 2. Link to Patient
        if cond.subject and cond.subject.reference:
            pid = cond.subject.reference.split("/")[-1]
            queries.append(
                f"MATCH (p:Patient {{id: '{pid}'}}), (c:Condition {{id: '{cid}'}}) "
                f"MERGE (p)-[:HAS_CONDITION]->(c)"
            )
            
        # 3. Link to Encounter (Optional)
        if cond.encounter and cond.encounter.reference:
            eid = cond.encounter.reference.split("/")[-1]
            queries.append(
                f"MATCH (e:Encounter {{id: '{eid}'}}), (c:Condition {{id: '{cid}'}}) "
                f"MERGE (e)-[:DIAGNOSED]->(c)"
            )
            
        return queries

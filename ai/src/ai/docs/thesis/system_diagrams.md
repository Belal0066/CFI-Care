# System Diagrams (Mermaid)

## 1. High-Level Architecture
```mermaid
graph TD
    User([Clinician]) <--> UI[Streamlit Dashboard]
    UI <--> API[FastAPI Backend]
    
    subgraph "Core System (Belal Workstation Server)"
        API --> Orchestrator{LangGraph Agent}
        
        subgraph "Ingestion Layer"
            FHIR[FHIR Data] --> Normalizer[ToonNormalizer]
            Normalizer --> State[Patient State Compiler]
            State --> Qdrant[(Qdrant Vector DB)]
        end
        
        subgraph "Retrieval Layer"
            Orchestrator --> Intent[Intent Classifier]
            Intent --> Router{Routing Logic}
            Router -- "Patient Query" --> Retrieval[RetrievalStrategy]
            Retrieval <--> Qdrant
        end
        
        subgraph "Reasoning Layer"
            Retrieval --> Context[Context Assembly]
            Context --> Llama[llama.cpp / MedGemma 1.5]
            Router -- "General Med Query" --> MCP[MCP Client]
            MCP <--> Web[Internet/PubMed]
            MCP --> Llama
        end
    end
    
    Llama --> Response[Generation & Citation]
    Response --> Orchestrator
```

## 2. TOON Data Ingestion Pipeline
```mermaid
flowchart LR
    raw[Raw FHIR JSON] -->|Input| norm{ToonNormalizer}
    
    subgraph "Normalization Process"
        norm -->|Extract| date[Date/Time]
        norm -->|Simplify| type[Resource Type]
        norm -->|Format| val[Value & Ref Range]
        date & type & val --> toon["[Date] Type: Value (Range)"]
    end
    
    toon -->|Compile| state[PatientTimeline]
    state -->|Embed| bert[ModernPubMedBERT]
    bert -->|Index| vec[(Vector Store Node)]
    
    style toon fill:#f9f,stroke:#333,stroke-width:2px
```

## 3. LangGraph Agent Workflow
```mermaid
stateDiagram-v2
    [*] --> ClassifyIntent
    ClassifyIntent --> CheckRoute: Intent & Context
    
    state CheckRoute <<choice>>
    CheckRoute --> LocalRAG: Patient Specific
    CheckRoute --> MCPSearch: General Medical / Guidelines
    
    state LocalRAG {
        DetermineStrategy --> RetrieveNodes
        RetrieveNodes --> RankByRelevance
        RankByRelevance --> BoundedReasoning
    }
    
    state MCPSearch {
        ExtractClinicalEntities --> BuildConversationContext
        BuildConversationContext --> OptimizeQuery
        note right of OptimizeQuery
            Multi-Strategy Extraction:
            1. Extract from patient state
            2. Parse assistant responses
            3. LLM query rewriting
            4. Entity + intent combination
        end note
        OptimizeQuery --> CallPubMed
        CallPubMed --> SummarizeEvidence
    }
    
    BoundedReasoning --> GenerateResponse
    SummarizeEvidence --> GenerateResponse
    
    GenerateResponse --> VerifyCitations
    VerifyCitations --> [*]
```

## 4. Query Optimization Flow (MCP Path)
```mermaid
flowchart TD
    Start([User Query:<br/>"what are the guidelines<br/>for treating this patient?"]) --> Extract
    
    subgraph "Context Extraction"
        Extract[Extract Clinical Entities] --> E1[Patient State:<br/>Mycoplasma Pneumonia]
        Extract --> E2[Chat History:<br/>Recent Diagnoses]
        Extract --> E3[Assistant Responses:<br/>Treatment mentions]
    end
    
    E1 & E2 & E3 --> Combine[Combine Context]
    
    subgraph "LLM Query Optimization"
        Combine --> Prompt[Structured Prompt<br/>with Examples]
        Prompt --> LLM[MedGemma Optimizer]
        LLM --> Output[LLM Output with<br/>Reasoning + Query]
    end
    
    Output --> Parse{Extraction Strategy}
    
    Parse -->|Strategy 1| S1["Look for SEARCH: prefix"]
    Parse -->|Strategy 2| S2["Entity + Intent combination"]
    Parse -->|Strategy 3| S3["Medical term + action pattern"]
    
    S1 & S2 & S3 --> Clean[Clean & Validate]
    Clean --> Final["Optimized Query:<br/>Mycoplasma Pneumonia<br/>treatment guideline"]
    
    Final --> MCP[MCP Server]
    MCP --> PubMed[(PubMed API)]
    PubMed --> Results[Relevant Articles]
    
    style Final fill:#90EE90,stroke:#333,stroke-width:2px
    style Start fill:#FFB6C1,stroke:#333,stroke-width:2px
```

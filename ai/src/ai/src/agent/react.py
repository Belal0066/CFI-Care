"""
Bounded ReAct loop types, scoped to MedMCP evidence-gathering only (see
query_mcp / _run_mcp_react_loop in graph/nodes.py).

Genuine ReAct requires the model to iteratively decide actions and observe
results between them — this is deliberately NOT applied to patient-record
reasoning. ClinicalReasoner stays fully deterministic; that boundary is the
system's actual grounding guarantee and isn't touched here. This loop is
scoped to MedMCP's read-only, side-effect-free external lookups, where a
model deciding "do I need one more lookup" is safe, and where a single
deterministic call structurally cannot handle a multi-hop question (e.g.
checking cross-reactivity with a second drug class after finding the first
interaction).

Steps are stored as this structured type, not hidden free-form chain-of-
thought — the loop is auditable data, not an opaque generation.
"""
from typing import Any, Dict, Literal

from pydantic import BaseModel, Field

# The action space is deliberately narrower than "every MCP tool": rendering
# a chart (VizMCP) belongs to a different graph branch (visualize), not to
# evidence-gathering, so it is not offered as an action here.
MCPReActActionName = Literal["get_medical_data", "finish"]


class MCPReActStep(BaseModel):
    """One decided-and-executed (or terminal) step in the loop."""
    step_index: int
    thought: str
    action: MCPReActActionName
    action_input: Dict[str, Any] = Field(default_factory=dict)
    observation_summary: str = ""

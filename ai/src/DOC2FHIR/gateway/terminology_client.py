from __future__ import annotations

from typing import Any


class TerminologyClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self.base_url = base_url
        self.api_key = api_key

    def enrich_condition(self, resource: dict[str, Any]) -> dict[str, Any]:
        return resource

    def enrich_observation(self, resource: dict[str, Any]) -> dict[str, Any]:
        return resource

    def enrich_medication(self, resource: dict[str, Any]) -> dict[str, Any]:
        return resource

    def enrich_allergy(self, resource: dict[str, Any]) -> dict[str, Any]:
        return resource

    def enrich_procedure(self, resource: dict[str, Any]) -> dict[str, Any]:
        return resource

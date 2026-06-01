"""Taxonomy helpers for Python tests (pytest + allure).

Provides a small, framework-agnostic API for applying labels and attaching
common artifacts so developers can use the same semantics across languages.
"""
import json
import allure
import sys

def apply_labels(labels: dict):
    if not labels:
        return
    for k, v in labels.items():
        if v is None:
            continue
        try:
            allure.dynamic.label(k, v)
        except Exception:
            try:
                # fallback for other allure bindings
                allure.label(k, v)
            except Exception:
                pass

def set_history_id(history_id: str):
    if not history_id:
        return
    apply_labels({"historyId": history_id})

def attach_json(name: str, obj):
    try:
        content = obj if isinstance(obj, str) else json.dumps(obj, indent=2)
        allure.attach(content, name, allure.attachment_type.JSON)
    except Exception:
        try:
            allure.attach(str(obj), name, allure.attachment_type.TEXT)
        except Exception:
            pass

def attach_request_response(req, res):
    try:
        attach_json('request', req)
        attach_json('response', res)
    except Exception:
        pass

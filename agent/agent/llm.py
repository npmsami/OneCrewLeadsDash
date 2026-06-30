"""Shared OpenAI chat-completions helper.

Ports llmBodySnippet + llmHttpNode + LLM_EXTRACT from build_workflow.js:
  - one request at a time, throttled to >= 6s apart (n8n batchInterval 6000)
  - temperature: 0, auto-omitted for reasoning models (gpt-5*, o*) that reject it
  - lenient JSON extraction from the model's reply (strips ``` fences, grabs {...})
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any

import requests

from .config import Config

log = logging.getLogger(__name__)

_TIMEOUT = 120
_MIN_INTERVAL = 6.0  # seconds between calls (matches n8n batchInterval 6000ms)
_lock = threading.Lock()
_last_call = 0.0


def _throttle() -> None:
    global _last_call
    with _lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def chat(
    prompt: str,
    cfg: Config,
    *,
    temperature: float = 0,
    system: str | None = None,
) -> dict[str, Any]:
    """Call OpenAI chat-completions. Returns the parsed response JSON.

    On a transport/HTTP error returns {"error": {"message": ...}} so callers can
    record `score_error` exactly like the n8n Parse nodes did (onError=continue).

    `temperature` defaults to 0 (deterministic scoring); the website-audit writer
    passes a higher value for varied copy. `system`, when given, is sent as a
    leading system message (the audit writer uses a long persona prompt).
    """
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    body: dict[str, Any] = {"model": cfg.llm_model, "messages": messages}
    if not cfg.llm_omit_temperature:
        body["temperature"] = temperature

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cfg.llm_api_key}",
    }

    _throttle()
    try:
        resp = requests.post(cfg.llm_api_base, headers=headers, data=json.dumps(body), timeout=_TIMEOUT)
        data = resp.json()
        if resp.status_code >= 400:
            msg = (data.get("error") or {}).get("message") if isinstance(data, dict) else None
            return {"error": {"message": msg or f"HTTP {resp.status_code}: {resp.text[:200]}"}}
        return data
    except Exception as exc:  # noqa: BLE001
        log.warning("LLM call failed: %s", exc)
        return {"error": {"message": str(exc)}}


_FENCE_HEAD = re.compile(r"^```(json)?", re.I)
_FENCE_TAIL = re.compile(r"```$")
_OBJ = re.compile(r"\{[\s\S]*\}")


def extract_json(response: dict[str, Any]) -> tuple[str | None, Any]:
    """Port of LLM_EXTRACT: returns (raw_content, parsed_obj_or_None)."""
    raw = None
    try:
        raw = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raw = None

    parsed = None
    if raw:
        cleaned = _FENCE_TAIL.sub("", _FENCE_HEAD.sub("", str(raw).strip())).strip()
        m = _OBJ.search(cleaned)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = None
    return raw, parsed


def error_message(response: dict[str, Any], raw: str | None) -> str:
    """Best-effort error string, mirroring Parse Score's errMsg logic."""
    err = response.get("error") if isinstance(response, dict) else None
    if err:
        if isinstance(err, dict):
            return str(err.get("message") or json.dumps(err))
        return str(err)
    if raw:
        return "unparseable: " + str(raw)[:150]
    return "empty LLM response"

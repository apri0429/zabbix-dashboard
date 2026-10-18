#!/usr/bin/env python3
"""
Klien model Hermes (Nous Research) lewat API yang kompatibel OpenAI
(`POST {HERMES_BASE_URL}/chat/completions`). Jadi bisa dipakai dengan:
- Ollama lokal       : HERMES_BASE_URL=http://127.0.0.1:11434/v1   HERMES_MODEL=hermes3:8b
- LM Studio lokal    : HERMES_BASE_URL=http://127.0.0.1:1234/v1    HERMES_MODEL=<nama model>
- OpenRouter         : HERMES_BASE_URL=https://openrouter.ai/api/v1 HERMES_MODEL=nousresearch/hermes-4-70b
- Nous Portal        : HERMES_BASE_URL=https://inference-api.nousresearch.com/v1
- Hermes Agent       : HERMES_BASE_URL=http://127.0.0.1:8642/v1  HERMES_MODEL=hermes-agent
                       HERMES_API_KEY=<API_SERVER_KEY di ~/.hermes/.env>  HERMES_USE_TOOLS=false
                       (login model, mis. OAuth Claude, diatur di Hermes Agent sendiri)
API key cuma perlu untuk layanan online / Hermes Agent; Ollama/LM Studio boleh kosong.

Dipakai oleh:
- noc_report.py -> complete(): ringkasan rekap mingguan/bulanan.
- app.py        -> chat_with_tools(): fitur "Tanya Jaringan" (chat).
"""

import os
import json
import logging
from typing import Callable, Dict, List, Optional

import requests

HERMES_BASE_URL = os.getenv("HERMES_BASE_URL", "").strip().rstrip("/")
HERMES_API_KEY = os.getenv("HERMES_API_KEY", "").strip()
HERMES_MODEL = os.getenv("HERMES_MODEL", "hermes3:8b").strip()
try:
    HERMES_TIMEOUT = int(os.getenv("HERMES_TIMEOUT", "180"))
except (TypeError, ValueError):
    HERMES_TIMEOUT = 180

# Hermes Agent (API server `hermes gateway`) menjalankan tool miliknya sendiri dan
# tidak memakai `tools` dari klien -> set false; data jaringan lalu dikirim langsung
# di prompt. Model Hermes biasa (Ollama/OpenRouter) mendukung tools -> true.
HERMES_USE_TOOLS = os.getenv("HERMES_USE_TOOLS", "true").strip().lower() not in ("0", "false", "no")

# Batas putaran panggil-tool per pertanyaan, supaya model yang "bingung" tidak
# memanggil tool terus-menerus.
MAX_TOOL_ROUNDS = 5


def enabled() -> bool:
    return bool(HERMES_BASE_URL and HERMES_MODEL)


def _post(body: Dict) -> Dict:
    headers = {"Content-Type": "application/json"}
    if HERMES_API_KEY:
        headers["Authorization"] = f"Bearer {HERMES_API_KEY}"
    r = requests.post(f"{HERMES_BASE_URL}/chat/completions", json=body,
                      headers=headers, timeout=HERMES_TIMEOUT)
    if r.status_code >= 400:
        raise RuntimeError(f"Hermes HTTP {r.status_code}: {r.text[:500]}")
    try:
        return r.json()
    except ValueError:
        # Biasanya HERMES_BASE_URL menunjuk ke dashboard web Hermes (port 9119), bukan API.
        raise RuntimeError(f"{HERMES_BASE_URL} bukan API Hermes (balasan bukan JSON). Pakai API "
                           f"server Hermes Agent (default port 8642, akhiri dengan /v1), bukan "
                           f"dashboard web (port 9119).")


def _message(payload: Dict) -> Dict:
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError(f"Hermes tanpa choices: {str(payload)[:500]}")
    return choices[0].get("message") or {}


def complete(system: str, prompt: str, temperature: float = 0.4,
             max_tokens: int = 4096) -> Optional[str]:
    """Satu kali tanya-jawab tanpa tool. None kalau gagal / belum dikonfigurasi."""
    if not enabled():
        return None
    try:
        msg = _message(_post({
            "model": HERMES_MODEL,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }))
        return (msg.get("content") or "").strip() or None
    except Exception:
        logging.exception("Hermes: gagal membuat jawaban")
        return None


def chat_with_tools(messages: List[Dict], tools: List[Dict],
                    handlers: Dict[str, Callable[..., object]],
                    temperature: float = 0.3) -> Dict:
    """Loop tanya-jawab dengan tool calling (format OpenAI).

    `tools`    : daftar definisi {"type": "function", "function": {...}}.
    `handlers` : {nama_tool: fungsi(**argumen)} yang hasilnya di-JSON-kan ke model.

    Server/model yang tidak mendukung tools (HTTP 400) otomatis dicoba ulang tanpa
    tools; jawaban tetap jalan memakai data yang sudah ada di prompt sistem.
    Balikin {"answer": str, "tools_used": [nama, ...]}.
    """
    if not enabled():
        raise RuntimeError("Hermes belum dikonfigurasi (isi HERMES_BASE_URL & HERMES_MODEL di .env)")

    convo = list(messages)
    used: List[str] = []
    use_tools = bool(tools) and HERMES_USE_TOOLS
    for _ in range(MAX_TOOL_ROUNDS + 1):
        body = {"model": HERMES_MODEL, "messages": convo, "temperature": temperature,
                "max_tokens": 2048}
        if use_tools:
            body["tools"] = tools
        try:
            msg = _message(_post(body))
        except RuntimeError as e:
            if use_tools and "HTTP 400" in str(e):
                logging.warning("Hermes: tools ditolak server, ulang tanpa tools — %s", e)
                use_tools = False
                continue
            raise

        calls = msg.get("tool_calls") or []
        if not calls:
            return {"answer": (msg.get("content") or "").strip(), "tools_used": used}

        convo.append({"role": "assistant", "content": msg.get("content") or "",
                      "tool_calls": calls})
        for call in calls:
            fn = call.get("function") or {}
            name = fn.get("name") or ""
            raw_args = fn.get("arguments") or {}
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except (ValueError, TypeError):
                args = {}
            handler = handlers.get(name)
            if handler is None:
                result: object = {"error": f"tool '{name}' tidak dikenal"}
            else:
                try:
                    result = handler(**(args or {}))
                except Exception as e:
                    logging.exception("Hermes: tool %s gagal", name)
                    result = {"error": str(e)}
            used.append(name)
            convo.append({"role": "tool", "tool_call_id": call.get("id") or name, "name": name,
                          "content": json.dumps(result, ensure_ascii=False, default=str)[:12000]})

    # Masih minta tool setelah batas putaran: paksa jawab dengan data yang ada.
    msg = _message(_post({"model": HERMES_MODEL, "messages": convo + [{
        "role": "user", "content": "Jawab sekarang dengan data yang sudah ada, tanpa memanggil tool lagi."}],
        "temperature": temperature, "max_tokens": 2048}))
    return {"answer": (msg.get("content") or "").strip(), "tools_used": used}

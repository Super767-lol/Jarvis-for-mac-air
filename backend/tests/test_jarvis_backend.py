"""Backend tests for Jarvis API"""
import os
import json
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hi-there-2160.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session_id():
    return f"test-{uuid.uuid4()}"


# --- Root / health endpoint ---
def test_root_status():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "status" in data
    assert data["status"] == "ready"
    assert "Jarvis" in data.get("message", "") or "jarvis" in data.get("message", "").lower()


# --- New session ---
def test_new_session():
    r = requests.post(f"{API}/session/new", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "session_id" in data
    # Validate UUID
    uuid.UUID(data["session_id"])


# --- SSE streaming chat ---
def test_chat_stream_sse(session_id):
    payload = {"session_id": session_id, "message": "Say hi in 3 words."}
    full_text = ""
    saw_done = False
    saw_delta = False
    with requests.post(f"{API}/chat/stream", json=payload, stream=True, timeout=60) as r:
        assert r.status_code == 200, r.text
        assert "text/event-stream" in r.headers.get("content-type", "")
        for raw in r.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data:"):
                continue
            try:
                obj = json.loads(raw[5:].strip())
            except Exception:
                continue
            if obj.get("type") == "delta":
                saw_delta = True
                full_text += obj.get("content", "")
            elif obj.get("type") == "done":
                saw_done = True
                break
            elif obj.get("type") == "error":
                pytest.fail(f"Stream error: {obj.get('message')}")
    assert saw_delta, "No delta events received"
    assert saw_done, "No done event received"
    assert len(full_text.strip()) > 0, "Empty assistant response"


# --- History retrieval after stream ---
def test_chat_history_after_stream(session_id):
    r = requests.get(f"{API}/chat/history/{session_id}", timeout=15)
    assert r.status_code == 200, r.text
    msgs = r.json()
    assert isinstance(msgs, list)
    assert len(msgs) >= 2, f"Expected >=2 messages, got {len(msgs)}"
    # First should be user, then assistant
    roles = [m["role"] for m in msgs]
    assert "user" in roles
    assert "assistant" in roles
    # Ensure no mongo _id leaks
    for m in msgs:
        assert "_id" not in m
        assert "session_id" in m
        assert "content" in m


# --- Clear history ---
def test_clear_history(session_id):
    r = requests.delete(f"{API}/chat/history/{session_id}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "deleted" in data
    assert data["deleted"] >= 2

    # Verify empty after clear
    r2 = requests.get(f"{API}/chat/history/{session_id}", timeout=15)
    assert r2.status_code == 200
    assert r2.json() == []


# --- Empty history for unknown session ---
def test_unknown_session_history_empty():
    r = requests.get(f"{API}/chat/history/{uuid.uuid4()}", timeout=15)
    assert r.status_code == 200
    assert r.json() == []

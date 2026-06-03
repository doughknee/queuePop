"""
A tiny in-memory event bus so the web dashboard can show recent activity
(queue pops, match accepts, connect/disconnect, champ-select actions).

This is intentionally dependency-free and thread-safe: the LCU loop runs on a
background thread while the webview/JS reads events from the main thread.
"""

import threading
from collections import deque

# Bounded history so we never grow without limit while the app runs for hours.
_MAX_EVENTS = 200

_lock = threading.Lock()
_events = deque(maxlen=_MAX_EVENTS)
_seq = 0


def push(message, level="info", kind=None):
    """
    Record an event. `level` is a UI hint: info | success | warning | danger.
    `kind` is an optional machine-readable tag (e.g. "queue_pop") that lets
    clients react to specific events without parsing the message text.
    Returns the assigned monotonic id (useful for incremental polling).
    """
    global _seq
    with _lock:
        _seq += 1
        _events.append({
            "id": _seq,
            "level": level,
            "message": str(message),
            "kind": kind,
        })
        return _seq


def get_since(after_id=0, limit=100):
    """Return events with id > after_id (oldest first), capped at `limit`."""
    with _lock:
        items = [e for e in _events if e["id"] > after_id]
    return items[-limit:]


def latest_id():
    with _lock:
        return _seq


def clear():
    global _seq
    with _lock:
        _events.clear()
        _seq = 0

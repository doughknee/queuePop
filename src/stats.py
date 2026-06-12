"""Lifetime service-record counters (ready checks accepted, champ selects,
locks, bench grabs, trades), shown on the About page.

Stored in stats.json next to config.json — deliberately NOT in config.json so
the settings schema stays frozen and a corrupt/reset config never wipes the
record. Increments are rare (a handful per game), so each one writes through
to disk; a failed read or write degrades to in-memory counting silently.
"""

import json
import os
import threading
import time

import config

PATH = os.path.join(os.path.dirname(config.CONFIG_FILE), "stats.json")

_lock = threading.Lock()
_stats = None  # loaded lazily so importers don't pay disk I/O at startup


def _load_locked():
    global _stats
    if _stats is not None:
        return
    _stats = {}
    try:
        with open(PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            _stats = {k: v for k, v in data.items()
                      if isinstance(v, (int, float))}
    except Exception:
        pass
    _stats.setdefault("since", time.time())  # when the record started


def inc(key, n=1):
    """Bump a counter and write through. Never raises."""
    try:
        with _lock:
            _load_locked()
            _stats[key] = int(_stats.get(key, 0)) + n
            try:
                with open(PATH, "w", encoding="utf-8") as f:
                    json.dump(_stats, f, indent=2)
            except OSError:
                pass  # keep counting in memory
    except Exception:
        pass


def snapshot():
    """A copy of the counters for the UI."""
    with _lock:
        _load_locked()
        return dict(_stats)

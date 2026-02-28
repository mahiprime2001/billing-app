"""
Global Supabase connectivity circuit state.
"""

import time
import threading

_lock = threading.Lock()
_offline_until = 0.0
_offline_cooldown_seconds = 45
_last_probe_at = 0.0
_probe_interval_seconds = 10


def mark_failure() -> None:
    global _offline_until
    with _lock:
        _offline_until = time.time() + _offline_cooldown_seconds


def mark_success() -> None:
    global _offline_until
    with _lock:
        _offline_until = 0.0


def is_offline() -> bool:
    with _lock:
        return time.time() < _offline_until


def should_probe() -> bool:
    global _last_probe_at
    now = time.time()
    with _lock:
        if now - _last_probe_at >= _probe_interval_seconds:
            _last_probe_at = now
            return True
    return False


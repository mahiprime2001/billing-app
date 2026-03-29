"""
Global Supabase connectivity circuit state.
"""

import time
import threading

_lock = threading.Lock()
_offline_until = 0.0
_offline_cooldown_seconds = 45
_offline_cooldown_max_seconds = 300
_failure_streak = 0
_last_probe_at = 0.0
_probe_interval_seconds = 10


def mark_failure() -> None:
    global _offline_until, _failure_streak
    with _lock:
        _failure_streak += 1
        cooldown = min(
            _offline_cooldown_max_seconds,
            _offline_cooldown_seconds * (2 ** max(0, _failure_streak - 1)),
        )
        _offline_until = time.time() + cooldown


def mark_success() -> None:
    global _offline_until, _failure_streak
    with _lock:
        _offline_until = 0.0
        _failure_streak = 0


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


def force_probe() -> None:
    """
    Clear offline cooldown so the next Supabase request can probe immediately.
    Useful after connectivity resumes.
    """
    global _offline_until, _last_probe_at
    with _lock:
        _offline_until = 0.0
        _last_probe_at = 0.0


def time_remaining_seconds() -> float:
    with _lock:
        return max(0.0, _offline_until - time.time())

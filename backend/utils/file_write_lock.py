"""
Per-path locking for local JSON file access.

The background sync thread (scripts/sync_manager.py) and live Flask request
threads both read/write the same JSON files with no coordination today --
a confirmed lost-update race. This app runs single-process (PyInstaller
onedir, plain app.run(), no gunicorn workers), so an in-process lock is
fully sufficient; this would need revisiting only if that ever changes.
"""
import os
import threading
from contextlib import contextmanager

_locks_guard = threading.Lock()
_locks: dict[str, threading.Lock] = {}


def _lock_for(path: str) -> threading.Lock:
    key = os.path.normcase(os.path.abspath(path))
    lock = _locks.get(key)
    if lock is None:
        with _locks_guard:
            lock = _locks.get(key)
            if lock is None:
                lock = threading.Lock()
                _locks[key] = lock
    return lock


@contextmanager
def file_write_lock(path: str):
    lock = _lock_for(path)
    with lock:
        yield

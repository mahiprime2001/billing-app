"""
Replaces test_file_write_lock.py (deleted) now that local storage moved off
per-file JSON+file-locking onto utils/sqlite_store.py -- same underlying
concern (concurrent writers must never corrupt the store, concurrent
readers must never see a torn write), now proven against SQLite's own
WAL-mode + busy_timeout locking instead of the old hand-rolled file lock.
"""
import threading

import pytest

from utils import sqlite_store


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    """Every test gets its own throwaway SQLite file -- never touches the
    real data/local_store.db."""
    monkeypatch.setattr(sqlite_store, "_DB_PATH", str(tmp_path / "test_store.db"))
    sqlite_store.initialize_schema()


def test_concurrent_writes_never_corrupt_the_store():
    n_threads = 20
    barrier = threading.Barrier(n_threads)
    errors = []

    def writer(i: int):
        try:
            barrier.wait()  # maximize actual concurrent overlap
            payload = {"writer": i, "data": list(range(500))}
            assert sqlite_store.save_table_data("concurrent", payload) is True
        except Exception as e:  # pragma: no cover - surfaced via `errors`
            errors.append(e)

    threads = [threading.Thread(target=writer, args=(i,)) for i in range(n_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors

    # Must always be valid, complete JSON -- never truncated or interleaved
    # -- and must exactly equal exactly one writer's payload (whichever ran
    # last), never a hybrid of two.
    result = sqlite_store.get_table_data("concurrent", None)
    assert result is not None
    assert set(result.keys()) == {"writer", "data"}
    assert 0 <= result["writer"] < n_threads
    assert result["data"] == list(range(500))


def test_concurrent_readers_never_see_a_torn_write():
    sqlite_store.save_table_data("read_during_write", {"version": 0, "data": list(range(2000))})

    stop = threading.Event()
    errors = []

    def writer():
        version = 1
        while not stop.is_set():
            sqlite_store.save_table_data("read_during_write", {"version": version, "data": list(range(2000))})
            version += 1

    def reader():
        for _ in range(200):
            try:
                data = sqlite_store.get_table_data("read_during_write", None)
                assert data is not None
                assert set(data.keys()) == {"version", "data"}
                assert data["data"] == list(range(2000))
            except Exception as e:  # pragma: no cover
                errors.append(e)

    writer_thread = threading.Thread(target=writer)
    writer_thread.start()
    try:
        reader()
    finally:
        stop.set()
        writer_thread.join()

    assert not errors


def test_write_then_read_back_round_trips():
    payload = [{"id": "a", "n": 1}, {"id": "b", "n": 2}]
    assert sqlite_store.save_table_data("roundtrip", payload) is True
    assert sqlite_store.get_table_data("roundtrip", []) == payload
